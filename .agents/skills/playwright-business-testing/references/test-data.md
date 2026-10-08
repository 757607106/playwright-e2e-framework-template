# 业务测试数据

先读目标仓库的 `docs/test-data.md`、`docs/configuration.md`、`model.config.ts`、已有 `tests/support/data/*.recipe.ts` 和应用 factory。沿用统一 `testData`/`resources` fixtures。

1. 根据确认的输入契约区分语义字段、结构/边界字段、计算字段、真实后端 ID 和状态。模型只生成许可的语义字段；代码产生约束与计算结果，测试预期来自独立的业务规则。
2. 需要新配方时运行 `npm run data:init -- --name <名称>`，再按真实业务修改 schema、build、rules 和 cases。保持稳定规则/场景 ID，代码行为变化时升级 recipe version。
3. 默认先离线生成、校验并运行本地示例。只有用户要求模型准备且已有可用配置时显式使用 `--mode llm`；模型准备独立于正式回归。缺少配置时完成配方与离线验证，说明在线模型未验证。
4. 正例满足全部规则；负例先有合法基础，再通过 mutate 精确违反 expectedViolations。不要过滤掉所有非法输入，也不要接受额外违反规则的样本。
5. 保存并审查 JSON 批次。用 `data:validate` / `data:inspect` 检查，正式用例只通过 `testData.load(recipe, { datasetId })` 或 file 重放。缺失或版本不兼容保持失败，不在 fixture 中临时请求模型。
6. factory 用真实接口依次创建依赖对象，收到 ID 后立即登记精确清理，再处理后续步骤。不要伪造外键、账号、业务状态或接口；重复批次使用新的 runId 和后端 ID。

不要把真实个人数据、凭据、私有接口响应或生产样本放进模型上下文与公开模板。批次保存在被忽略的 artifacts/test-data；报告默认只附 manifest。实际数据、提示词和语义结果的可发送范围由用户的环境与现有授权决定。

交付说明记录批次 ID、来源（offline/llm）、recipe 版本、验证场景、实际业务运行和清理结果。模型准备成功、静态校验通过、本地示例通过与真实业务通过分别报告。

共享模型字段使用 `MODEL_NAME`、`API_BASE_URL`、`API_KEY`；按需配置 `MODEL_PROVIDER`、`MODEL_PROTOCOL`、`MODEL_OUTPUT_MODE`。先用 `npm run model:check` 检查配置，该命令不调用模型；用实际小批次确认在线兼容性。正式重放使用 `DATASET_ID`，不要求模型配置。
