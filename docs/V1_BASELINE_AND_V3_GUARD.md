# v1 基线与 v3 迁移护栏

> 基线日期：2026-07-28
> 基线提交：`75d6ca3e1fd1bbeb71d2de8bda61c596933dcfcd`
> 对应 Issue：[#20](https://github.com/yuhonghan1001-droid/revenue-pulse-mvp/issues/20)

## 1. 目的

在广告收入 v3 增量开发开始前，固定当前 v1 的页面、API、模拟数据快照和飞书卡片预览基线。v3 默认关闭，关闭时现有线上页面、接口、自动任务和飞书行为保持不变。

## 2. 可运行基线

- 主分支：`main`
- 生产构建：通过
- v1 回归测试：3 项通过
- 页面：服务端渲染成功，保留经营罗盘、分析框架、数据健康、指标口径、证据链和推送预览六个关键区域
- API：`GET /api/analysis/latest` 返回完整快照与规则简报
- 模拟数据：截止 `2026-07-25`，24 个数据源，27,408 行经营事实
- 飞书卡片预览：标题、接收人、节奏和渠道已写入 `tests/fixtures/v1-baseline.json`
- 本基线验证不调用 `/api/analysis/run`、`/api/feishu/push`，不会保存新版本或发送飞书

结构化回归夹具：

```text
tests/fixtures/v1-baseline.json
```

## 3. 功能开关

环境变量：

```text
ENABLE_AD_REVENUE_V3=false
```

规则：

- 未配置、空值或任何非 `true` 值都视为关闭；
- 只有明确配置为 `true` 才开启 v3 入口；
- 当前生产环境不设置或保持 `false`；
- v3 未获用户审查通过前，不允许在生产环境打开；
- 关闭时 `/api/v3/*` 不暴露能力，现有 v1 路由继续按原逻辑执行。

## 4. v3 文件边界

后续 v3 增量只放在以下命名空间中：

```text
app/v3/               v3 页面与组件
worker/v3/            v3 API、功能开关与服务端逻辑
data_pipeline/v3/     v3 数据合同、加工和快照
tests/v3/             v3 专属测试
```

共享 v1 文件只有在对应 Issue 明确要求且具有回归测试时才允许修改。现有 `/api/analysis/*`、`/api/feishu/*` 和公开页面默认继续服务 v1。

本基线仅记录旧 v1 的现状，不把旧版预算口径带入 v3。v3 后续实现继续遵守已批准范围：不新增预算指标、预算分析或预算数据依赖。

## 5. 回滚入口

本 Issue 的回滚只需：

1. 保持或恢复 `ENABLE_AD_REVENUE_V3=false`；
2. 撤回 `worker/v3/`、`.env.example` 和本 Issue 新增的基线夹具；
3. 撤回 `worker/index.ts` 中的 v3 状态入口；
4. 重新运行生产构建和 v1 回归测试。

不需要修改 v1 数据、数据库、线上密钥或飞书配置。
