# 广告收入 MVP 数据管道

这套 MVP 用代码完整模拟了 24 个数据集的拼接过程。

执行顺序：

1. `generate_demo_data.py` 生成 24 个模拟源文件；
2. `run_pipeline.py` 校验源文件、统一关联键并完成拼接；
3. 生成前端直接使用的 `app/data/dashboard.json`；
4. `publish_snapshot.py` 将最新快照提交给线上收入分析 Skill，并可同步推送飞书。

真实接入时，只需保留注册表中的稳定 `id` 和目标字段，将 CSV 读取替换为企业数据仓库查询、API 或文件下载适配器。核心计算、质量检查和看板输出不需要重写。

关键控制点包括：

- 数据源是否全部到齐；
- 复合主键是否重复；
- 维表关联是否完整；
- 经营口径与财务确收是否一致；
- 每个数据源是否满足更新时间要求。

本地检查快照：

```bash
python3 data_pipeline/publish_snapshot.py --dry-run
```

提交线上分析并推送飞书：

```bash
REVENUE_PUSH_TOKEN=保密令牌 \
python3 data_pipeline/publish_snapshot.py --push
```

真实接入时，由每个数据源适配器先更新 `data/raw/` 或直接生成相同字段结构，再运行现有拼接、质量检查和发布步骤。每次线上运行都会保存数据截止时间、执行引擎、质量状态和结构化简报，便于追踪预测版本变化。
