# 管理层简报标准

## 必备结构

### 1. 核心结论

直接说明收入是否在轨、管理层需要关注什么，并写明数据截止时间。避免使用没有信息量的标题。

推荐句式：

`截至 {cutoff}，净收入 {actual}，同比 {yoy}；月底预计 {forecast}，较预算 {gap}。`

### 2. 四层比较

展示：

- 实际净收入；
- 可比同比；
- 时间进度预算达成率；
- 全月预测较预算差异；
- 较上一版预测变化。

### 3. 动因桥

最多展示三个重要正向动因和三个重要负向动因。先写量化影响，再写解释，同时披露未解释残差。

### 4. 数据置信度

展示整体数据质量状态、延迟的关键数据源、财务对账差异和已知缺口。指出哪些结论仍为临时判断。

### 5. 行动

每项行动必须包括：

- 明确动作；
- 责任人；
- 截止时间；
- 触发条件或成功标准。

禁止只写“持续关注”，却不提供阈值和责任人。

## 结论表达

在可审计输出中明确标注：

- 事实：“数据显示……”
- 预测：“基于……假设，预计……”
- 判断：“结合……，BP 判断……”
- 风险：“由于……尚未确认，存在……风险”

不能通过删掉限定词，把判断包装成事实。

## 按阅读对象调整

### 财务 BP

包含计算细节、财务对账、数据源健康情况、预测假设和待确认问题。

### 业务负责人

突出可控制的商家、流量和产品动作，并给出下一步行动；同时保留指标定义入口。

### 财务负责人

突出预测较目标差异、风险金额、数据置信度、需要做出的决策和责任人。

### 高层管理者

使用一个结论、三个动因、两个风险和明确决策。只有当运营细节会改变决策时才展开。

## 飞书卡片

保证首屏可以快速阅读：

1. 核心结论和数据截止时间；
2. 实际、预算和预测指标；
3. 首要动因；
4. 风险或所需行动；
5. 受治理看板链接。

禁止在卡片中放置凭证、个人原始标识或无权限的商家级明细。

## 结构化简报格式

需要自动校验或自动推送时，使用以下结构：

```json
{
  "as_of": "YYYY-MM-DDTHH:MM:SS+08:00",
  "audience": "finance_leader",
  "decision_status": "watch",
  "data_quality": {
    "status": "warn",
    "freshness_pct": 95.8,
    "completeness_pct": 99.7,
    "uniqueness_pct": 100.0,
    "join_success_pct": 99.6,
    "blockers": []
  },
  "metrics": {
    "actual_net_revenue": {"value": 0, "unit": "CNY", "source_ids": ["billing"]},
    "yoy_growth_pct": {"value": 0, "unit": "%", "source_ids": ["billing", "calendar"]},
    "budget_attainment_pct": {"value": 0, "unit": "%", "source_ids": ["billing", "budget"]},
    "month_end_forecast": {"value": 0, "unit": "CNY", "source_ids": ["billing", "forecast"]},
    "forecast_vs_budget_pct": {"value": 0, "unit": "%", "source_ids": ["forecast", "budget"]}
  },
  "claims": [
    {
      "type": "fact",
      "text": "截至当前累计净收入……",
      "evidence_refs": ["metric:actual_net_revenue"],
      "source_ids": ["billing"],
      "confidence": "high"
    }
  ],
  "drivers": {"positive": [], "negative": [], "unexplained_residual": 0},
  "forecast_assumptions": ["近7日运行速度保持稳定"],
  "actions": [
    {"action": "核实搜索流量变化", "owner": "流量策略", "due_date": "YYYY-MM-DD", "trigger": "连续3日低于基线5%"}
  ],
  "known_gaps": [],
  "limitations": ["转化数据延迟，暂不发布ROI判断"]
}
```
