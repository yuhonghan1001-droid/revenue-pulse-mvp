import type {
  AggregateV3,
  FieldMappingV3,
  QualityCheckV3,
  RevenueAnalysisInputV3,
  RevenueBasis,
  SourceProfileV3,
} from "./contracts.ts";
import { REVENUE_CONTRACT_VERSION } from "./contracts.ts";

export type ParsedLocalFile = {
  sourceId: string;
  filename: string;
  format: "csv" | "xlsx";
  sheetName?: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  mappings: FieldMappingV3[];
  warnings: string[];
};

const SEMANTIC_GUESSES: Array<[string, RegExp]> = [
  ["date", /^(date|day|日期|时间|统计日期)$/i],
  ["revenue", /^(revenue|ad_revenue|收入|广告收入|经营收入)$/i],
  ["actual_ad_spend", /^(spend|cost|actual_ad_spend|消耗|广告消耗|实际消耗)$/i],
  ["monetizable_vv", /^(monetizable_vv|commercial_vv|可商业化vv|商业流量)$/i],
  ["opportunities", /^(opportunities|ad_opportunities|广告机会)$/i],
  ["requests", /^(requests|ad_requests|广告请求)$/i],
  ["filled_requests", /^(filled_requests|fills|填充请求|填充量)$/i],
  ["impressions", /^(impressions|exposures|曝光|广告曝光)$/i],
  ["clicks", /^(clicks|点击|广告点击)$/i],
  ["gmv", /^(gmv|成交金额|交易金额)$/i],
  ["attributed_gmv", /^(attributed_gmv|ad_gmv|归因gmv|广告归因gmv)$/i],
  ["dau", /^(dau|日活)$/i],
  ["active_advertisers", /^(active_advertisers|active_merchants|活跃广告主)$/i],
  ["prior_active_advertisers", /^(prior_active_advertisers|上期活跃广告主)$/i],
  ["retained_advertisers", /^(retained_advertisers|留存广告主)$/i],
  ["bounce_rate", /^(bounce_rate|exit_rate|退出率|跳出率)$/i],
  ["average_dwell_seconds", /^(average_dwell_seconds|dwell_seconds|平均停留时长)$/i],
  ["organic_conversion_rate", /^(organic_conversion_rate|自然转化率)$/i],
  ["advertiser", /^(advertiser|advertiser_id|merchant_id|广告主|广告主id)$/i],
  ["ad_format", /^(ad_format|ad_product|广告形式|广告产品)$/i],
  ["traffic_scene", /^(traffic_scene|scene|流量场景|场景)$/i],
  ["billing_method", /^(billing_method|计费方式)$/i],
  ["category", /^(category|industry|类目|行业)$/i],
  ["advertiser_tier", /^(advertiser_tier|merchant_tier|广告主分层|商家分层)$/i],
];

const IGNORED_FIELD_PATTERN =
  /(monthly_budget|time_phased_budget|budget_attainment|forecast_vs_budget|merchant_budget|budget_utilization|月度预算|预算完成|预算利用)/i;

function sourceId(filename: string) {
  const normalized = filename.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-");
  return `local-${normalized.replace(/^-|-$/g, "").slice(0, 50) || "file"}`;
}

export function inferSemanticField(header: string) {
  if (IGNORED_FIELD_PATTERN.test(header)) return "ignored_budget_field";
  return SEMANTIC_GUESSES.find(([, pattern]) => pattern.test(header.trim()))?.[0] ?? "unknown";
}

function inferMappings(id: string, headers: string[]): FieldMappingV3[] {
  return headers.map((header) => {
    const semanticField = inferSemanticField(header);
    return {
      sourceId: id,
      sourceColumn: header,
      semanticField,
      confirmed: semanticField !== "unknown",
    };
  });
}

function parseDelimited(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", "\t", ";"];
  const delimiter = candidates
    .map((candidate) => [candidate, firstLine.split(candidate).length] as const)
    .sort((left, right) => right[1] - left[1])[0][0];
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      record.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(value.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      value = "";
    } else {
      value += character;
    }
  }
  record.push(value.trim());
  if (record.some(Boolean)) records.push(record);
  const headers = records.shift()?.map((header, index) => header || `column_${index + 1}`) ?? [];
  const rows = records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
  return { headers, rows };
}

function uint16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function uint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

type ZipEntry = { method: number; compressedSize: number; localOffset: number };

function readZipDirectory(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let endOffset = -1;
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65_557); offset -= 1) {
    if (uint32(view, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("无法识别 XLSX 文件结构");
  const entryCount = uint16(view, endOffset + 10);
  let offset = uint32(view, endOffset + 16);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < entryCount; index += 1) {
    if (uint32(view, offset) !== 0x02014b50) throw new Error("XLSX 目录损坏");
    const method = uint16(view, offset + 10);
    const compressedSize = uint32(view, offset + 20);
    const nameLength = uint16(view, offset + 28);
    const extraLength = uint16(view, offset + 30);
    const commentLength = uint16(view, offset + 32);
    const localOffset = uint32(view, offset + 42);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateEntry(buffer: ArrayBuffer, entry: ZipEntry) {
  const view = new DataView(buffer);
  if (uint32(view, entry.localOffset) !== 0x04034b50) throw new Error("XLSX 条目损坏");
  const nameLength = uint16(view, entry.localOffset + 26);
  const extraLength = uint16(view, entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method !== 8) throw new Error("XLSX 使用了不支持的压缩方式");
  const stream = new Blob([compressed]).stream().pipeThrough(
    new DecompressionStream("deflate-raw" as CompressionFormat),
  );
  return new Response(stream).arrayBuffer();
}

async function xmlEntry(
  buffer: ArrayBuffer,
  entries: Map<string, ZipEntry>,
  path: string,
) {
  const entry = entries.get(path);
  if (!entry) throw new Error(`XLSX 缺少 ${path}`);
  return new TextDecoder().decode(await inflateEntry(buffer, entry));
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function parseXlsx(buffer: ArrayBuffer) {
  const entries = readZipDirectory(buffer);
  if (
    [...entries.keys()].some(
      (name) => /vbaProject|externalLinks|embeddings/i.test(name),
    )
  ) {
    throw new Error("为保护数据安全，不支持含宏、外部链接或嵌入对象的工作簿");
  }
  const parser = new DOMParser();
  const workbook = parser.parseFromString(
    await xmlEntry(buffer, entries, "xl/workbook.xml"),
    "application/xml",
  );
  const relationships = parser.parseFromString(
    await xmlEntry(buffer, entries, "xl/_rels/workbook.xml.rels"),
    "application/xml",
  );
  const relationshipMap = new Map(
    [...relationships.getElementsByTagName("Relationship")].map((node) => [
      node.getAttribute("Id") ?? "",
      node.getAttribute("Target") ?? "",
    ]),
  );
  const sheet = workbook.getElementsByTagName("sheet")[0];
  if (!sheet) throw new Error("工作簿没有可读取的工作表");
  const relationId =
    sheet.getAttribute("r:id") ??
    sheet.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "id",
    ) ??
    "";
  const target = relationshipMap.get(relationId);
  if (!target) throw new Error("无法定位首个工作表");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sharedStrings: string[] = [];
  if (entries.has("xl/sharedStrings.xml")) {
    const shared = parser.parseFromString(
      await xmlEntry(buffer, entries, "xl/sharedStrings.xml"),
      "application/xml",
    );
    for (const item of shared.getElementsByTagName("si")) {
      sharedStrings.push([...item.getElementsByTagName("t")].map((node) => node.textContent ?? "").join(""));
    }
  }
  const worksheet = parser.parseFromString(
    await xmlEntry(buffer, entries, sheetPath),
    "application/xml",
  );
  const matrix: string[][] = [];
  for (const rowNode of worksheet.getElementsByTagName("row")) {
    const row: string[] = [];
    for (const cell of rowNode.getElementsByTagName("c")) {
      const index = columnIndex(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t");
      const raw =
        cell.getElementsByTagName("v")[0]?.textContent ??
        cell.getElementsByTagName("t")[0]?.textContent ??
        "";
      row[index] = type === "s" ? sharedStrings[Number(raw)] ?? "" : raw;
    }
    matrix.push(row);
  }
  const headers = (matrix.shift() ?? []).map((value, index) => value || `column_${index + 1}`);
  const rows = matrix
    .filter((row) => row.some((value) => value != null && value !== ""))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    );
  return { headers, rows, sheetName: sheet.getAttribute("name") ?? "Sheet1" };
}

export async function parseLocalFile(file: File): Promise<ParsedLocalFile> {
  const id = sourceId(file.name);
  const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
  const parsed = isXlsx
    ? await parseXlsx(await file.arrayBuffer())
    : parseDelimited(await file.text());
  if (!parsed.headers.length) throw new Error("文件没有表头");
  if (!parsed.rows.length) throw new Error("文件没有可分析的数据行");
  const warnings = parsed.headers
    .filter((header) => inferSemanticField(header) === "ignored_budget_field")
    .map((header) => `“${header}”已识别为本版本不使用的字段，将保持忽略。`);
  return {
    sourceId: id,
    filename: file.name,
    format: isXlsx ? "xlsx" : "csv",
    ...parsed,
    mappings: inferMappings(id, parsed.headers),
    warnings,
  };
}

function numeric(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.replaceAll(",", "").replace(/[￥¥%]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return value.includes("%") ? parsed / 100 : parsed;
}

function dateValue(value: string | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function selectedColumns(files: ParsedLocalFile[]) {
  const selected = new Map<string, { file: ParsedLocalFile; column: string }>();
  for (const file of files) {
    for (const mapping of file.mappings) {
      if (
        mapping.confirmed &&
        mapping.semanticField !== "unknown" &&
        mapping.semanticField !== "ignored_budget_field" &&
        !selected.has(mapping.semanticField)
      ) {
        selected.set(mapping.semanticField, { file, column: mapping.sourceColumn });
      }
    }
  }
  return selected;
}

function dateColumnFor(file: ParsedLocalFile) {
  return file.mappings.find(
    (mapping) => mapping.confirmed && mapping.semanticField === "date",
  )?.sourceColumn;
}

function sumForPeriod(
  rows: Array<Record<string, string>>,
  column: string,
  dateColumn: string,
  dates: Set<string>,
) {
  return rows.reduce((sum, row) => {
    const date = dateValue(row[dateColumn]);
    const value = numeric(row[column]);
    return date && dates.has(date) && value != null && value >= 0 ? sum + value : sum;
  }, 0);
}

export function buildLocalAnalysisInput(
  files: ParsedLocalFile[],
  basis: RevenueBasis,
): RevenueAnalysisInputV3 {
  const selected = selectedColumns(files);
  const dateSelection = selected.get("date");
  if (!dateSelection) throw new Error("至少确认一个日期字段");
  const dates = [
    ...new Set(
      dateSelection.file.rows
        .map((row) => dateValue(row[dateSelection.column]))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  if (dates.length < 2) throw new Error("至少需要两个不同日期，才能建立可比期间");
  const split = Math.ceil(dates.length / 2);
  const comparisonDates = new Set(dates.slice(0, split));
  const currentDates = new Set(dates.slice(split));
  if (!currentDates.size) throw new Error("日期范围不足以拆分本期和对比期");

  const aggregate = (targetDates: Set<string>, label: string): AggregateV3 & {
    start: string;
    end: string;
    label: string;
  } => {
    const values: AggregateV3 = {};
    for (const semantic of [
      "revenue",
      "actual_ad_spend",
      "monetizable_vv",
      "opportunities",
      "requests",
      "filled_requests",
      "impressions",
      "clicks",
      "gmv",
      "attributed_gmv",
      "dau",
      "active_advertisers",
      "prior_active_advertisers",
      "retained_advertisers",
    ]) {
      const selection = selected.get(semantic);
      if (!selection) continue;
      const localDateColumn = dateColumnFor(selection.file);
      if (!localDateColumn) continue;
      const value = sumForPeriod(
        selection.file.rows,
        selection.column,
        localDateColumn,
        targetDates,
      );
      const field = {
        actual_ad_spend: "actualAdSpend",
        monetizable_vv: "monetizableVv",
        filled_requests: "filledRequests",
        attributed_gmv: "attributedGmv",
        active_advertisers: "activeAdvertisers",
        prior_active_advertisers: "priorActiveAdvertisers",
        retained_advertisers: "retainedAdvertisers",
      }[semantic] ?? semantic;
      (values as Record<string, number>)[field] = value;
    }
    for (const semantic of ["bounce_rate", "average_dwell_seconds", "organic_conversion_rate"]) {
      const selection = selected.get(semantic);
      if (!selection) continue;
      const localDateColumn = dateColumnFor(selection.file);
      if (!localDateColumn) continue;
      const periodValues = selection.file.rows
        .filter((row) => {
          const date = dateValue(row[localDateColumn]);
          return date && targetDates.has(date);
        })
        .map((row) => numeric(row[selection.column]))
        .filter((value): value is number => value != null && value >= 0);
      if (!periodValues.length) continue;
      const field = ({
        bounce_rate: "bounceRate",
        average_dwell_seconds: "averageDwellSeconds",
        organic_conversion_rate: "organicConversionRate",
      } as Record<string, string>)[semantic];
      (values as Record<string, number>)[field] =
        periodValues.reduce((sum, value) => sum + value, 0) / periodValues.length;
    }
    if (basis === "advertiser_spend" && values.actualAdSpend != null) {
      values.revenue = values.actualAdSpend;
    }
    const period = [...targetDates].sort();
    return { ...values, start: period[0], end: period.at(-1)!, label };
  };

  const profiles: SourceProfileV3[] = files.map((file) => ({
    sourceId: file.sourceId,
    displayLabel: file.filename,
    format: file.format,
    sourceRoles: ["ignored"],
    rowCount: file.rows.length,
    timeGrain: "unknown",
    dimensionGrain: file.mappings
      .map((mapping) => mapping.semanticField)
      .filter((field): field is SourceProfileV3["dimensionGrain"][number] =>
        ["advertiser", "ad_format", "traffic_scene", "billing_method", "category", "advertiser_tier"].includes(field),
      ),
    primaryKeyColumns: dateColumnFor(file) ? [dateColumnFor(file)!] : [],
    currency: "CNY",
    timezone: "Asia/Shanghai",
  }));
  const quality: QualityCheckV3[] = [
    {
      id: "local_parse",
      label: "本地解析",
      status: "pass",
      path: "all",
      detail: `${files.length} 个文件仅在当前浏览器内解析`,
    },
    {
      id: "basis",
      label: "收入口径",
      status: basis === "unconfirmed" ? "fail" : "pass",
      path: "all",
      detail: basis === "unconfirmed" ? "收入口径待确认" : "已由用户确认",
    },
  ];
  return {
    contractVersion: REVENUE_CONTRACT_VERSION,
    classification: "real",
    basis,
    current: aggregate(currentDates, "本期"),
    comparison: aggregate(comparisonDates, "前半期"),
    profiles,
    mappings: files.flatMap((file) => file.mappings),
    quality,
    slices: [],
    strategyEvents: [],
  };
}
