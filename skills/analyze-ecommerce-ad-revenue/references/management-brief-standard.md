# 管理简报标准

## 必备结构

### 1. 身份与状态

首屏写明：

- 收入口径；
- 数据截止时间和比较期间；
- 数据属于模拟还是真实；
- 整体质量状态；
- 可用和不可用的分析路径。

### 2. 核心结论

先写收入及可比变化，再写最大贡献和主要限制。没有可比基准时不生成变化率。

推荐句式：

```text
截至 {as_of}，{basis} 为 {revenue}，较 {comparison} {change}。
流量路径的最大贡献来自 {factor}；{unavailable_path} 因 {reason} 暂不可用。
```

### 3. 两条路径

展示：

- 流量变现：可商业化 VV、Ad Load、eCPM 和贡献；
- GMV 变现：GMV、广告货币化率和贡献；
- 每条路径自己的质量状态与缺口。

### 4. 广告主与体验

展示广告主 ROI、活跃和留存，以及退出率、停留时长、自然转化率。无正式阈值时只描述变化。

### 5. 证据和限制

每条结论引用指标 ID 和数据源 ID。把事实、观察和待确认分开；披露残差、不可用指标和业务范围差异。

### 6. 待确认事项

使用明确的问题、负责人和截止时间。避免“持续关注”一类无法验收的表述。

## 结构化简报格式

```json
{
  "contract_version": "3.0",
  "classification": "demo",
  "analysis_id": "rv3-example",
  "as_of": "2026-07-27",
  "basis": "operating_ad_revenue",
  "basis_label": "广告经营收入",
  "comparison_label": "上期",
  "quality_status": "pass",
  "metrics": {
    "revenue": {
      "value": 12600000,
      "unit": "CNY",
      "status": "available",
      "source_ids": ["ad_revenue"]
    },
    "ad_load": {
      "value": 0.12,
      "unit": "ratio",
      "status": "available",
      "source_ids": ["ad_delivery"]
    },
    "ecpm": {
      "value": 150,
      "unit": "CNY",
      "status": "available",
      "source_ids": ["ad_revenue", "ad_delivery"]
    },
    "ad_take_rate": {
      "value": 0.02,
      "unit": "ratio",
      "status": "available",
      "source_ids": ["ad_revenue", "commerce"]
    }
  },
  "paths": [
    {"id": "traffic_monetization", "status": "available"},
    {"id": "gmv_monetization", "status": "available"}
  ],
  "contribution_bridges": [
    {
      "id": "traffic_base",
      "change": 2100000,
      "contributions": [],
      "residual": 0
    }
  ],
  "claims": [
    {
      "type": "fact",
      "text": "本期广告经营收入较上期增长。",
      "metric_ids": ["revenue"],
      "source_ids": ["ad_revenue"]
    }
  ],
  "known_gaps": [],
  "limitations": ["没有实验支持时不声明因果"],
  "review_status": "draft"
}
```

## 飞书卡片

首屏依次展示：

1. 收入口径、截止时间和质量状态；
2. 收入及可比变化；
3. 最大贡献；
4. Ad Load、eCPM、广告货币化率；
5. 广告主 ROI 或留存；
6. 数据缺口；
7. 受保护看板链接。

真实数据卡片必须先完成财务 BP 人工审核和收件人确认。卡片不得包含凭证、个人标识、原始商家明细或未经确认的财务口径。
