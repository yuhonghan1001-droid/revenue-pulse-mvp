# Revenue Pulse｜广告收入经营罗盘

一个面向电商广告业务的经营分析 MVP：用代码拼接 24 个数据集，完成收入监控、月底预测、BP 驱动模型、动因拆解、指标治理、数据健康检查和可追溯经营简报。

[在线演示](https://revenue-pulse-mvp.happynamely.chatgpt.site)

> 本项目只包含程序生成的模拟数据，不包含任何企业真实收入、商家或财务数据。

## 解决什么问题

财务 BP 经常需要回答：

- 截至今天，本月广告收入是多少？
- 与同比、预算和上一版预测相比表现如何？
- 月底大约会达到多少？
- 增长或下降发生在哪些行业、广告产品和流量场景？
- 哪些变化是数据事实，哪些是业务判断，哪些仍需业务确认？

Revenue Pulse 将取数、拼接、质量检查和经营分析串成一个可重复运行的流程。

## 功能

- 本月累计收入、同比、预算完成率和月底预测
- 实际、同比、预算、最新预测四层 BP 比较框架
- 流量变现、商家需求、计费确收三棵收入驱动树
- 实际、预测和预算累计趋势
- 行业、广告产品和流量场景三类动因下钻
- 异常与增长机会清单
- 24 个数据源健康中心：及时性、完整性、唯一性和关联成功率
- 统一的指标口径中心：定义、公式、粒度、负责人和依赖数据
- 事实、预测、判断、风险四类结论的证据链
- 可复制的管理层经营摘要与每日推送预览
- 服务端飞书机器人推送接口（默认个人私信，群 Webhook 作为备用；所有凭证仅通过托管环境密钥注入）
- 主键重复、维表匹配、财务对账、及时性和已知数据缺口检查

## AI Skill

项目包含可复用的 [`analyze-ecommerce-ad-revenue`](skills/analyze-ecommerce-ad-revenue/SKILL.md) Skill，将财务 BP 的收入分析方法从代码中进一步沉淀为显式的 AI 工作规范。

Skill 覆盖：

- 实际、同比、预算和预测的统一指标口径；
- 多源数据的及时性、完整性、唯一性、关联和财务对账门槛；
- 流量变现、商家需求、计费到确收三棵收入驱动树；
- 事实、预测、判断和风险的证据链；
- 面向财务 BP、业务负责人、财务老板和管理层的分层输出；
- 业务反馈转化为新规则、评测案例和回归验证的迭代机制。

结构化经营简报可通过 Skill 内置校验器检查：

```bash
python3 skills/analyze-ecommerce-ad-revenue/scripts/validate_brief.py path/to/brief.json
```

Skill 只有在新增案例通过且历史案例无回退时，才将规则变化视为能力升级。这样可以区分“修改了一段提示词”和“形成了可验证的新财务分析能力”。

### 运行时接入

Skill 已接入线上执行链路：

```text
24 源数据管道
    → dashboard.json 最新快照
    → 数据质量门槛
    → 收入分析 Skill
    → 保存快照与分析版本
    → 看板读取最新结果
    → 按需推送飞书个人私信
```

- `POST /api/analysis/run`：接收最新快照并执行 Skill，需要服务端令牌。
- `GET /api/analysis/latest`：读取最近一次已经保存的分析结果。
- `data_pipeline/publish_snapshot.py`：把 Python 管道的最新结果提交给线上执行器。
- `.github/workflows/revenue-skill-daily.yml`：工作日北京时间 09:45 自动运行，也支持在 GitHub Actions 手动运行。

定时任务需要在 GitHub 仓库 Actions secrets 中配置 `REVENUE_PUSH_TOKEN`，其值应与托管环境中的同名密钥一致。

线上环境可以配置：

- `OPENAI_API_KEY`：可选；配置后由模型按照完整 Skill 生成管理层语言，必须作为密钥保存。
- `OPENAI_MODEL`：可选；默认 `gpt-5.6-sol`。

未配置模型密钥时，系统使用可审计规则引擎生成简报，指标计算、质量门槛、版本保存和飞书推送仍然正常运行。AI 只增强管理层语言，不允许修改受治理指标。

## 数据管道

```text
24 个原始数据集
        ↓
数据源注册表与字段标准化
        ↓
主键、复合键和粒度检查
        ↓
商家 / 产品 / 流量 / 日期维度关联
        ↓
经营口径与财务确收对账
        ↓
指标合约、收入驱动树、预测、动因和异常计算
        ↓
可追溯证据链与推送内容生成
        ↓
dashboard.json → 经营驾驶舱
```

本仓库包含 24 个模拟源文件，覆盖：

- 商家主数据、行业、分层、区域、客户经理和生命周期
- 广告产品、定价和流量场景
- 日历、营销活动和策略事件
- 收入、曝光、点击、转化、流量库存和商家预算
- 计费确收、返点、退款、预测基线和月度预算
- 数据源更新时间与 SLA

数据源定义位于 `data_pipeline/config/source_registry.json`。真实接入时，可以把 CSV 读取替换为数据仓库查询、API 或自动下载适配器，保留后续的关联、检查和输出逻辑。

## 本地运行

要求 Node.js 22.13+ 和 Python 3.10+。

```bash
pnpm install
python3 data_pipeline/generate_demo_data.py
python3 data_pipeline/run_pipeline.py
pnpm run dev
```

打开 `http://localhost:3000`。

生成生产版本：

```bash
pnpm run build
```

## 目录

```text
app/                         驾驶舱页面与前端数据
data_pipeline/
  config/source_registry.json  24 个数据源注册表
  generate_demo_data.py        模拟数据生成
  run_pipeline.py              拼接、计算与质量检查
  data/raw/                    模拟源数据
skills/
  analyze-ecommerce-ad-revenue/  可复用、可评测的财务 BP 收入分析 Skill
```

## 接入真实数据

建议按以下顺序替换：

1. 保持 `source_registry.json` 中的数据源 ID 稳定；
2. 将模拟 CSV 替换为真实查询或文件适配器；
3. 对齐商家、产品、流量和日期关联键；
4. 确认经营收入、计费收入与财务确收的差异；
5. 与历史人工报表并行运行两到三个周期；
6. 对账稳定后，再启用自动推送。

涉及真实财务数据时，请自行增加权限控制、脱敏、审计日志和密钥管理。

## License

[MIT](LICENSE)
