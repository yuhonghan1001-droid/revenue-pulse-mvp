# Revenue Pulse｜广告收入经营分析

Revenue Pulse 是一个面向电商广告业务财务 BP 的可运行 MVP。它把广告收入拆到可归因、可追溯的经营变量，并将公开模拟演示与真实数据工作区严格分开。

- GitHub：<https://github.com/yuhonghan1001-droid/revenue-pulse-mvp>
- 公开站点：<https://revenue-pulse-mvp.happynamely.chatgpt.site>
- v0.3 模拟看板：发布后访问 `/v3`
- 项目交接：[PROJECT_HANDOFF_CN.md](PROJECT_HANDOFF_CN.md)

> 仓库和公开看板只包含程序生成的模拟数据，不包含企业真实收入、广告主、交易或个人数据。

## v0.3 能做什么

### 公开模拟看板

任何人无需登录即可查看：

- 广告经营收入及可比变化；
- `VV × Ad Load × eCPM` 流量变现路径；
- `GMV × 广告货币化率` GMV 变现路径；
- 三因子和六因子 Shapley 贡献；
- GMV 与货币化率中点贡献；
- 广告形式、场景、计费方式、类目和广告主分层下钻；
- 广告主 ROI、活跃和留存；
- 退出率、停留时长和自然转化护栏；
- 数据质量、指标状态、证据链和管理简报。

### 受保护的真实数据工作区

获准用户访问 `/workspace` 后可以：

1. 上传 CSV、TSV 或无宏 XLSX；
2. 在浏览器本地识别字段和样例；
3. 确认收入、流量、投放、GMV、广告主和体验字段；
4. 明确当前金额是经营收入、实际消耗、可计费金额还是月结收入；
5. 检查本期数据支持哪些分析路径；
6. 生成受治理的聚合分析；
7. 人工审核管理简报；
8. 在服务端功能明确开启后，人工确认推送飞书。

原始文件和样例值不会上传。默认只在当前页面保留结果；只有明确开启真实聚合结果保存后，服务端才保存受保护的聚合合同。

## 分析逻辑

基础流量路径：

```text
广告收入 = 可商业化 VV × Ad Load × eCPM ÷ 1000
Ad Load = 广告曝光 ÷ 可商业化 VV
eCPM = 广告收入 ÷ 广告曝光 × 1000
```

展开流量路径：

```text
广告收入 =
可商业化 VV
× 每 VV 广告机会
× 请求率
× 填充率
× 渲染率
× eCPM ÷ 1000
```

GMV 路径：

```text
广告收入 = GMV × 广告货币化率
广告货币化率 = 广告收入 ÷ 同期间同范围 GMV
```

基础 Ad Load 已包含曝光形成结果，不能再额外乘一次填充率。分母缺失、为零或业务范围不兼容时，指标显示“不可用”及原因，不补零、不生成 `NaN`。

## 收入口径

系统不会把 Sales、广告消耗或可计费金额自动称为财务收入。每次分析必须确认一个口径：

- 广告经营收入；
- 广告实际消耗；
- 可计费金额；
- 月结实际收入；
- 其他；
- 当前无法确认。

选择“当前无法确认”时，系统只盘点数据，不生成收入结论。

## 本地运行

要求 Node.js 22.13+ 和 Python 3.10+。

```bash
pnpm install
python3 data_pipeline/generate_demo_data_v3.py
python3 data_pipeline/run_pipeline_v3.py
pnpm test
pnpm run dev
```

打开：

- 旧版兼容页面：`http://localhost:3000/`
- v0.3 模拟看板：`http://localhost:3000/v3`
- 受保护工作区：`http://localhost:3000/workspace`

本地 Worker 默认关闭 v0.3 路由。需要测试时，在本地环境中设置：

```text
ENABLE_AD_REVENUE_V3=true
```

## v0.3 目录

```text
app/v3/                                  公开模拟看板
app/workspace/                           受保护工作区
app/data/dashboard-v3.json               v3 模拟快照
components/revenue-v3/                   v3 页面组件
lib/revenue-v3/                          合同、指标、归因和本地解析
worker/v3/                               v3 API、D1、飞书与隔离
data_pipeline/config/source_registry_v3.json
data_pipeline/generate_demo_data_v3.py
data_pipeline/run_pipeline_v3.py
skills/analyze-ecommerce-ad-revenue/      Revenue Skill 2.0
drizzle/0001_revenue_v3.sql              新增式 D1 迁移
```

## Revenue Skill 2.0

Skill 将分析方法沉淀为可复用规则：

```text
skills/analyze-ecommerce-ad-revenue/
  SKILL.md
  agents/openai.yaml
  references/
  scripts/validate_brief.py
```

AI 只能整理已经计算完成的受治理结论，不能新增或修改数字、补充没有依据的阈值，也不能把相关性写成因果。

校验结构化简报：

```bash
python3 skills/analyze-ecommerce-ad-revenue/scripts/validate_brief.py \
  tests/fixtures/revenue-v3-brief-valid.json
```

## API

开启 v0.3 后：

| 接口 | 访问要求 | 作用 |
|---|---|---|
| `GET /api/v3/public/latest` | 匿名 | 只读取公开模拟结果 |
| `POST /api/v3/analyses` | 登录允许名单或自动任务令牌 | 运行受治理分析 |
| `GET/POST /api/v3/mapping-profiles` | 登录允许名单 | 读取或保存不含样例值的字段映射 |
| `GET /api/v3/analyses/latest` | 登录允许名单 | 读取当前用户私有结果 |
| `GET /api/v3/analyses/:id` | 登录允许名单 | 读取本人结果或公开模拟结果 |
| `POST /api/v3/analyses/:id/approve` | 结果所有者 | 审核简报 |
| `POST /api/v3/analyses/:id/feishu` | 已审核、开关开启、幂等键 | 人工确认发送 |

自动任务令牌只能提交 `demo` 输入，不能提交真实数据。

## 功能开关

所有高风险能力默认关闭：

```text
ENABLE_AD_REVENUE_V3=false
ALLOW_REAL_DATA_PERSISTENCE=false
ALLOW_MANUAL_FEISHU_PUSH=false
ALLOW_AUTOMATED_FEISHU_PUSH=false
REVENUE_WORKSPACE_ALLOWED_EMAILS=
```

推荐发布顺序：

1. 运行迁移、测试和构建；
2. 只开启 `ENABLE_AD_REVENUE_V3`；
3. 验证匿名看板只显示模拟数据；
4. 配置工作区允许名单；
5. 单独评审是否开启真实聚合结果保存；
6. 单独评审是否开启人工飞书；
7. 自动飞书继续保持关闭。

详见 [v0.3 发布与回滚](docs/RELEASE_AND_ROLLBACK_V03.md)。

## 每日 09:45 自动任务

`.github/workflows/revenue-skill-daily.yml` 使用 UTC cron `45 1 * * *`，对应北京时间 09:45。

任务现在记录：

```text
scheduled_at
started_at
pipeline_finished_at
analysis_finished_at
feishu_sent_at
completed_at
```

时间审计作为 GitHub Actions artifact 保存 30 天，可以区分调度排队、数据管道、分析和发送延迟。自动任务只生成和发布模拟聚合分析，默认不发送飞书。

## 安全边界

- 公开接口只返回 `demo_public`；
- 真实结果只能是 `private`；
- 真实结果按登录用户隔离；
- 原始 CSV/XLSX 不上传；
- D1 不保存原始行或样例值；
- 未审核、质量失败、审核后内容变化或重复幂等键时，飞书不能发送；
- 密钥只保存在 Sites 环境或 GitHub Secrets；
- 不把收件人、邮箱、Open ID、Webhook 或令牌提交到 Git。

## 兼容与回滚

v0.3 是增量升级：

- 旧页面和旧 API 保留；
- 新表不删除 `analysis_runs`；
- v3 有独立合同、快照、管道和路由；
- 关闭 `ENABLE_AD_REVENUE_V3` 即可隐藏 v3 页面与 API；
- Sites 可以切回上一个已保存版本。

## 项目状态

v0.3 源码、模拟数据、Skill、API、工作区、自动化审计和测试已经完成本地实现。生产发布状态以 GitHub 最新提交、Actions 和 Sites 版本为准。

## License

[MIT](LICENSE)
