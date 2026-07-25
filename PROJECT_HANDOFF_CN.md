# Revenue Pulse 项目迁移与交接档案

> 更新时间：2026-07-26  
> 用途：把项目交给另一个 ChatGPT / Codex 或 GitHub 账号继续开发。  
> 安全说明：本文可以保存在公开仓库中，不包含任何令牌、飞书密钥、个人邮箱或企业真实财务数据。

## 1. 项目背景

项目来自电商广告业务财务 BP 的实际需求：

- 广告收入约占电商收入的主要部分，收入分析涉及二十多个数据集；
- BP 需要回答“截至今天收入如何、同比和预算如何、月底预计如何、涨跌发生在哪里、为什么”；
- 原流程主要依靠人工从多个系统下载、拼接和核对数据，每月只能完成一到两次；
- 目标是把取数、拼接、质量检查、预测、动因分析、管理层摘要和飞书推送做成可重复运行的工作流；
- 人负责定义业务口径、判断逻辑、异常规则和验收标准，AI 与代码负责重复执行。

这不是一个只展示图表的项目。核心价值是把财务 BP 的分析方法沉淀为：

1. 可执行的数据管道；
2. 可治理的指标口径；
3. 可追溯的结论证据链；
4. 可评测、可迭代的收入分析 Skill；
5. 可自动运行和推送的经营监控闭环。

## 2. 当前可访问成果

- GitHub 仓库：<https://github.com/yuhonghan1001-droid/revenue-pulse-mvp>
- 线上公开看板：<https://revenue-pulse-mvp.happynamely.chatgpt.site>
- 已成功运行的自动任务：<https://github.com/yuhonghan1001-droid/revenue-pulse-mvp/actions/runs/30158255701>
- 主分支：`main`
- 当前主分支提交：`830bc9a238dbd5add0b10fcfdf038d55f021ab34`
- 当前线上站点版本：Version 8
- 当前 Sites 项目 ID：见 `.openai/hosting.json`

## 3. 已完成并验证的能力

### 3.1 多源数据拼接

- 代码读取并拼接 24 个注册数据源；
- 数据源配置在 `data_pipeline/config/source_registry.json`；
- 关联商家、行业、区域、广告产品、流量场景、日期和财务确收等维度；
- 包含主键重复、维表匹配、完整性、及时性、财务对账等检查；
- 一次示范运行会拼接约 27,408 条收入事实记录；
- 输出统一快照到 `app/data/dashboard.json`。

### 3.2 动态日期与动态文案

以下内容已经不再写死：

- 分析截止日期；
- 月份和期间标题；
- 月度时间进度与剩余天数；
- 累计收入、同比、预算完成率和月底预测；
- 预测与预算差异；
- 正向和负向动因；
- 数据质量提醒；
- 管理层摘要、异常数量和飞书推送标题。

默认截止日期取收入与财务确收数据中的最新日期。需要历史重跑时，可设置：

```bash
REVENUE_AS_OF=2026-07-24 python3 data_pipeline/run_pipeline.py
```

### 3.3 看板统一读取完整快照

此前页面存在“部分区域读实时 Skill、部分区域读构建时静态数据”的问题，目前已经统一：

```text
数据管道
  → 完整 dashboard 快照
  → POST /api/analysis/run
  → 数据库保存完整快照和分析结果
  → GET /api/analysis/latest
  → 整个看板读取同一份最新快照
```

只有在数据库还没有任何运行结果时，页面才会整体使用仓库内的兜底快照，不会把两份数据混在一起。

线上最终验证结果：

- `persisted=true`
- 截止日期：`2026-07-25`
- 趋势：31 天
- 数据源健康记录：24 个
- 指标口径：8 个
- 证据链：4 条

### 3.4 收入分析 Skill

Skill 名称：`analyze-ecommerce-ad-revenue`

位置：

```text
skills/analyze-ecommerce-ad-revenue/
  SKILL.md
  agents/openai.yaml
  references/
    metric-contracts.md
    data-quality-and-guardrails.md
    driver-analysis.md
    management-brief-standard.md
    evaluation-and-iteration.md
  scripts/
    validate_brief.py
```

Skill 沉淀的财务分析方法包括：

- 实际、同比、预算、预测四层比较；
- 流量变现、商家需求、计费确收三棵驱动树；
- 事实、预测、判断、风险四类证据；
- 数据质量门槛；
- 面向财务 BP、业务负责人和财务老板的不同输出层级；
- 将业务反馈转化为规则、评测案例和回归测试的迭代机制。

当前线上没有配置 `OPENAI_API_KEY`，所以管理层摘要由可审计的规则引擎生成。配置模型密钥后，AI 只负责增强管理层语言，不允许修改受治理指标。

### 3.5 GitHub 每日自动任务

工作流：

```text
.github/workflows/revenue-skill-daily.yml
```

运行时间：

- 每天北京时间 09:45；
- GitHub cron 为 `45 1 * * *`；
- 也支持在 GitHub Actions 页面手动运行。

自动任务依次执行：

1. 获取仓库；
2. 准备 Python；
3. 拼接 24 个数据源；
4. 执行质量检查；
5. 生成最新完整快照；
6. 调用线上收入分析 Skill；
7. 保存分析版本；
8. 推送飞书。

2026-07-25 已进行真实运行测试，所有步骤成功。

### 3.6 飞书推送

当前支持两种方式：

1. 飞书应用机器人个人私信，优先使用；
2. 群自定义机器人 Webhook，作为备用。

个人私信已经真实测试成功。任何接手账号都不应在公开仓库中记录接收人的邮箱、`open_id`、Webhook 或应用密钥。

## 4. 关键文件说明

| 文件 | 作用 |
|---|---|
| `app/page.tsx` | 看板页面，统一使用最新完整快照 |
| `app/data/dashboard.json` | 数据管道生成的兜底快照 |
| `worker/index.ts` | 分析 API、鉴权、飞书推送 |
| `worker/revenue-skill.ts` | Skill 运行时、规则分析、模型增强和版本保存 |
| `data_pipeline/run_pipeline.py` | 24 源拼接、指标、预测、动因和质量检查 |
| `data_pipeline/publish_snapshot.py` | 把快照提交到线上 Skill |
| `data_pipeline/config/source_registry.json` | 数据源、粒度、键和 SLA 注册表 |
| `.github/workflows/revenue-skill-daily.yml` | 每日自动运行 |
| `skills/analyze-ecommerce-ad-revenue/` | 财务 BP 分析 Skill |
| `tests/rendered-html.test.mjs` | 页面和完整快照接口回归测试 |
| `.openai/hosting.json` | 现有 Sites 项目绑定信息，不保存密钥 |

## 5. 环境变量与密钥

真实值只存在于托管环境或 GitHub Secrets，不在仓库中。

### Sites 运行环境

| 名称 | 是否必需 | 用途 |
|---|---:|---|
| `REVENUE_PUSH_TOKEN` | 是 | 保护 `/api/analysis/run` |
| `FEISHU_APP_ID` | 个人私信需要 | 飞书应用身份 |
| `FEISHU_APP_SECRET` | 个人私信需要 | 飞书应用密钥 |
| `FEISHU_RECIPIENT_OPEN_ID` | 个人私信需要 | 私信接收人 |
| `FEISHU_WEBHOOK_URL` | 可选 | 群机器人备用通道 |
| `OPENAI_API_KEY` | 可选 | 用模型增强管理层语言 |
| `OPENAI_MODEL` | 可选 | 默认 `gpt-5.6-sol` |

`FEISHU_PUSH_TOKEN` 是旧的兼容字段，新配置应使用独立的 `REVENUE_PUSH_TOKEN`。

### GitHub Actions Secrets

| 名称 | 用途 |
|---|---|
| `REVENUE_PUSH_TOKEN` | 必须与 Sites 环境中的同名值完全一致 |

迁移时不要复制聊天中的旧值。推荐生成新令牌，并同时更新 Sites 与 GitHub Actions。

## 6. 历史提交和 PR

主要提交：

| 提交 | 内容 |
|---|---|
| `b0431e8` | Build revenue analytics MVP |
| `9e93a82` | Prepare public open-source release |
| `9ff24c2` | Upgrade BP revenue intelligence（PR #1） |
| `830bc9a` | Fix scheduled snapshot publishing（PR #3） |

补充说明：

- PR #1 完成 BP 驱动模型、Skill、飞书、动态页面和自动任务主体；
- PR #3 修复 GitHub 运行器调用线上接口时被安全层拒绝的问题；
- PR #2 因旧分支经过 squash 后产生提交历史冲突，被 PR #3 取代并关闭；
- 最终自动任务运行 ID 为 `30158255701`。

## 7. 新账号接手的推荐方式

### 7.1 保留 GitHub 历史

如果只是换 GitHub 登录账号，最稳妥的方法是：

1. 由仓库所有者把新 GitHub 账号添加为 collaborator；
2. 新账号继续在同一个仓库和 `main` 分支开发；
3. 在新设备或新 Codex 中重新完成 GitHub 授权；
4. 不要重新建空仓库，否则 PR、Actions、Issues 和部署记录会分散。

如果必须更换仓库所有者，应使用 GitHub 的 repository transfer，而不是复制文件到新仓库。普通 clone 或 fork 可以保留 Git commit，但不会把原仓库的全部 PR、Actions 和配置历史变成新仓库历史。

### 7.2 在新 Codex 账号继续

1. 克隆或打开同一个 GitHub 仓库；
2. 首先阅读本文件和 `README.md`；
3. 确认当前分支是 `main`，工作区没有未提交修改；
4. 安装依赖并运行测试；
5. 连接新账号自己的 GitHub；
6. 如果新账号无权访问旧 Sites 项目，创建新站点，不要直接覆盖旧站点；
7. 在新站点重新设置所有环境密钥；
8. 更新 GitHub Actions 的站点 URL和 `REVENUE_PUSH_TOKEN`；
9. 手动运行一次工作流，确认快照写入和飞书推送都成功；
10. 最后再决定是否停用旧站点。

本地验证命令：

```bash
pnpm install
python3 data_pipeline/run_pipeline.py
pnpm test
```

### 7.3 Sites 迁移注意事项

`.openai/hosting.json` 绑定的是当前 Sites 项目。新 ChatGPT / Codex 账号可能没有该项目权限。

推荐做法：

1. 保留旧站点继续运行；
2. 备份 `.openai/hosting.json`；
3. 在新账号下创建新的 Sites 项目；
4. 让新工具写入新的项目 ID；
5. 重新设置密钥并部署；
6. 验证新站点后，再修改 GitHub 工作流中的 `REVENUE_PULSE_URL`；
7. 最后停用或保留旧站点。

不要把旧站点密钥写进 `.openai/hosting.json` 或任何 Git 文件。

## 8. ChatGPT 对话历史迁移

OpenAI 当前不支持完整合并两个 ChatGPT 账号，也不能把旧对话原样恢复成新账号侧边栏中的独立聊天。

个人账号可采用官方提供的参考迁移方法：

1. 在旧账号打开“设置”；
2. 进入“数据控制”；
3. 选择“导出数据”；
4. 下载邮件中的 ZIP；
5. 解压后找到 `conversations.json`；
6. 登录新个人账号；
7. 新建一条对话并上传该 JSON，让新对话把历史作为参考。

限制：

- 不会重建旧侧边栏；
- 不会合并账号；
- 不会迁移订阅、记忆、自定义设置、GPT、文件或工作区权限；
- ChatGPT Business / Enterprise 通常不能通过个人设置导出聊天；
- 订阅也不能在账号之间直接转移。

官方说明：

- <https://help.openai.com/en/articles/9106926-transferring-conversations-from-1-chatgpt-account-to-another-chatgpt-account>
- <https://help.openai.com/en/articles/7260999-how-do-i-export-my-data>
- <https://help.openai.com/en/articles/9135236-how-to-transfer-a-chatgpt-plus-or-chatgpt-pro-subscription-to-a-new-account>

## 9. 当前仍未完成的生产化工作

### 9.1 真实数据源尚未接入

仓库中的 24 个数据集是程序生成的模拟数据，最新日期为 `2026-07-25`。每日任务会自动重算，但如果源文件没有新增数据，业务数值不会自动变化。

真实接入需要：

- 数据仓库查询；
- 企业 API；
- 自动下载；
- 或定期落盘文件。

推荐为每个源增加适配器，同时保持 `source_registry.json` 中的数据源 ID、关联键和粒度稳定。

### 9.2 权限与合规

接入真实财务数据前，还需要增加：

- 站点访问控制；
- 数据脱敏；
- 最小权限；
- 密钥轮换；
- 审计日志；
- 失败重试和告警；
- 真实报表并行对账。

### 9.3 AI 模型当前为可选

当前没有配置 `OPENAI_API_KEY`，所以系统使用规则引擎。规则引擎已经能完成受治理的核心收入分析，模型用于改善叙述、提出待确认事项和适配不同读者。

## 10. 新账号的首条接续提示词

把下面内容作为新账号打开仓库后的第一条消息：

```text
请接手 Revenue Pulse 项目。

仓库：
https://github.com/yuhonghan1001-droid/revenue-pulse-mvp

开始前请完整阅读：
1. PROJECT_HANDOFF_CN.md
2. README.md
3. skills/analyze-ecommerce-ad-revenue/SKILL.md

当前已完成：
- 24 个模拟数据源的代码拼接；
- 动态日期、指标、预测和管理层文案；
- 全看板统一读取最新完整 Skill 快照；
- 收入分析 Skill；
- 飞书个人私信；
- GitHub 每日北京时间 09:45 自动运行；
- 线上公开站点。

当前最重要的边界：
- 24 个源仍是模拟数据，尚未连接企业真实数据仓库或 API；
- 现有 Sites 项目和密钥可能属于旧账号，不要假设新账号有权限；
- 不要把任何令牌、飞书 open_id、邮箱或真实财务数据提交到 GitHub；
- 不要从零重建已有框架。

请先进行只读检查：
- 确认 main 分支和工作区状态；
- 检查最近提交、GitHub Actions、线上接口和测试；
- 说明哪些资源新账号可以访问、哪些需要重新授权；
- 在改代码前给出最小迁移方案。
```

## 11. 验收标准

迁移完成后，应同时满足：

- GitHub 新账号能读取和提交同一仓库；
- 提交历史和 PR 历史仍可查；
- 本地数据管道可以运行；
- 测试和生产构建通过；
- 新站点或原站点能读取完整持久化快照；
- GitHub Actions 手动运行成功；
- 飞书收到测试消息；
- GitHub 与 Sites 中的 `REVENUE_PUSH_TOKEN` 一致；
- 公开仓库中没有任何密钥、个人标识或真实财务数据；
- 旧站点是否保留、停用或切流有明确记录。
