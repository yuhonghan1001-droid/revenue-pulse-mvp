# Revenue Pulse v0.3 发布、数据保留与回滚

> 版本：v0.3
> 日期：2026-07-28
> 适用范围：公开模拟看板、受保护工作区、v3 API、D1、GitHub Actions 和飞书

## 1. 发布前检查

必须同时满足：

- Python 管道和 Skill 校验通过；
- TypeScript 类型检查通过；
- 生产构建通过；
- v1 回归通过；
- v3 公式、贡献、粒度、隔离和页面测试通过；
- `app/data/dashboard-v3.json` 明确为 `demo`；
- Git 仓库没有密钥、个人标识或真实数据；
- D1 迁移只新增表；
- 自动飞书保持关闭。

## 2. 分阶段开启

### 阶段 A：公开模拟看板

1. 应用 `drizzle/0001_revenue_v3.sql`。
2. 部署验证通过的源代码。
3. 设置 `ENABLE_AD_REVENUE_V3=true`。
4. 保持其余高风险开关为 `false`。
5. 匿名访问 `/v3` 和 `/api/v3/public/latest`。
6. 确认结果为 `classification=demo`，页面明确显示“模拟数据”。

### 阶段 B：受保护工作区

1. 配置 `REVENUE_WORKSPACE_ALLOWED_EMAILS`。
2. 验证未登录用户被引导登录。
3. 验证允许名单外用户不能使用私有 API。
4. 用匿名测试文件验证 CSV 与 XLSX 本地解析。
5. 检查网络请求、日志和 D1 不包含原始行与样例值。

### 阶段 C：真实聚合结果保存

只有完成权限和数据保留评审后，才设置：

```text
ALLOW_REAL_DATA_PERSISTENCE=true
```

真实结果仍必须保持 `private`，并按用户所有者隔离。

### 阶段 D：人工飞书

只有确认飞书应用、收件人、审核流程和幂等记录后，才设置：

```text
ALLOW_MANUAL_FEISHU_PUSH=true
```

每次真实发送仍需用户在工作区点击确认。`ALLOW_AUTOMATED_FEISHU_PUSH` 在 v0.3 保持 `false`。

## 3. 数据保留

| 数据 | 位置 | 默认保留 |
|---|---|---|
| 公开模拟源和快照 | Git | 随版本历史 |
| 真实原始文件与样例 | 浏览器内存 | 当前页面会话 |
| 真实聚合输入和结果 | D1 | 未开启时不保存；开启后按企业政策 |
| 审核与飞书发送记录 | D1 | 按企业审计政策 |
| GitHub 时间审计 artifact | GitHub Actions | 30 天 |
| 密钥 | Sites / GitHub Secrets | 按密钥轮换政策 |

在企业政策尚未确定前，不应开启真实聚合结果保存。

## 4. 验收检查

- 流量公式与收入勾稽；
- GMV 公式与收入勾稽；
- Shapley 和中点贡献残差在舍入容差内；
- GMV 缺失只影响 GMV 路径；
- 零分母返回不可用；
- 粗粒度指标不能下钻到细粒度；
- 匿名接口只返回模拟结果；
- 自动任务令牌拒绝真实数据；
- 未审核或质量失败的结果不能发送；
- 同一幂等键不重复发送；
- 09:45 全链路时间点可从 artifact 查看。

## 5. 回滚

### 最快回滚

设置：

```text
ENABLE_AD_REVENUE_V3=false
ALLOW_REAL_DATA_PERSISTENCE=false
ALLOW_MANUAL_FEISHU_PUSH=false
ALLOW_AUTOMATED_FEISHU_PUSH=false
```

这会隐藏 v3 页面和 API，不影响 v1 页面和旧 API。

### 代码回滚

部署上一版已经验证的 Sites 版本。v3 D1 表可以保留，不需要删除；旧代码不会读取它们。

### 自动任务回滚

在 GitHub Actions 暂停 `Revenue Pulse v3 Daily`，或恢复上一版工作流。暂停任务不会影响已部署看板的兜底模拟快照。

### 飞书回滚

先关闭人工和自动飞书开关，再检查 `feishu_delivery_attempts_v3` 的最后状态。不要通过删除审计记录掩盖失败或重复尝试。

## 6. 回滚后验证

- `/api/v3/status` 返回 404；
- `/v3` 返回 404；
- v1 首页仍可打开；
- `/api/analysis/latest` 仍正常；
- 没有新的真实聚合结果或飞书尝试；
- D1 旧表和新增表均未被破坏性修改。
