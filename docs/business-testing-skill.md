# 用 Skill 接入自己的业务测试

仓库自带 `playwright-business-testing`，位置是 [`.agents/skills/playwright-business-testing/SKILL.md`](../.agents/skills/playwright-business-testing/SKILL.md)。它指导 AI 复用当前框架完成业务探索、登录与接口接入、场景计划、测试实现、覆盖登记、数据清理和失败诊断。

## 开始使用

1. 下载 ZIP 或克隆模板到自己的业务测试仓库，保留 `.agents/skills/` 隐藏目录。
2. 按 [中文说明](../README.zh-CN.md) 安装依赖并运行本地演示，确认框架能运行。
3. 用支持本地 Skills 的 Codex 打开该仓库。仓库级 `.agents/skills` 是 [官方支持的发现位置](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)，无需把文件复制到全局目录；未显示时重启 Codex。
4. 在任务中通过技能选择器选择它，或明确写 `$playwright-business-testing`。也支持按任务描述自动匹配。其他支持 Skill 文件的工具可显式读取上面的 `SKILL.md`，具体发现方式以其宿主为准。

Skill 不依赖模型 API 密钥写入这个仓库。模型访问由使用者的 AI 宿主提供；普通 `npm test` 和 CI 仍直接运行 Playwright。

## 提供哪些业务信息

提供本次要覆盖的业务流程、测试环境名称/地址、角色、预期业务结果，以及已有需求或接口文档的位置。账号通过本地环境变量或 CI secrets 配置；不要在对话中贴密码、令牌或登录状态。

环境和契约尚未齐备时，可以先产出计划和待确认项。真实接口、定位器与业务规则需要证据；只给一个网址不能自动得到经过验证的完整业务测试。

## 示例请求

首次接入：

> 使用 $playwright-business-testing 为我们的采购系统接入自动化测试。需求和接口文档在仓库 docs/business/，测试环境已配置在本地 .env。先检查现有 fixtures 和契约，完成登录接入，并为采购单创建、提交审批输出测试计划；本轮不要执行写操作。

实现已审查的场景：

> 使用 $playwright-business-testing 实现 specs/purchase-approval.md 中已审查的提交审批场景。允许在已配置的独立测试沙箱创建和提交本轮数据，按准确 ID 清理。复用统一 fixtures、API 校验、覆盖和报告，执行质量检查和目标用例，给出业务结果与清理证据。

增加已有业务覆盖：

> 使用 $playwright-business-testing 根据现有订单需求和测试，补充只读角色不能修改订单的场景。先核对 UI/API 权限契约，再复用已有数据和登录适配；只运行本次涉及的用例。

诊断失败：

> 使用 $playwright-business-testing 诊断指定订单用例失败，报告在 artifacts/playwright-report/。先检查 trace、网络和清理摘要，仅修复有证据的脚本缺陷，保留真实业务或环境失败。

## 接入后会得到什么

按请求范围生成或更新 `specs/` 中的计划、`tests/fixtures/` 的认证扩展、`tests/support/` 的业务适配层、`tests/e2e/` 的用例，以及 `tests/coverage/page-coverage.ts` 的场景登记。真实业务内容存放在使用者的应用仓库，公开模板保留通用能力。

验证沿用 `npm run quality:ci`、`npm run test:list` 和 `npm test -- <实际spec> --project=<目标project>`。报告明确区分静态检查、本地演示与真实业务验证；未执行和清理失败不会被描述为通过。

不支持实时浏览器访问时仍可根据已确认的需求和代码完成计划或实现，并说明验证限制。Skill 自身不提供浏览器权限，也不替代业务账号和隔离环境。

## 与官方测试 Agents 的关系

这个 Skill 可以由当前 AI 助手直接使用，无需初始化三个 Agents。如果使用者希望调用官方 Planner/Generator/Healer，按 [Agent 使用说明](agent-testing.md#use-your-own-application) 准备业务 seed，再执行 `npm run agents:init -- --project=chromium`。无参数初始化默认绑定本地演示。

Skill 随仓库维护。调整 fixtures、覆盖或清理 API 时同步核对其参考文件；详细框架契约仍以实现和 [接入指南](adoption-guide.md) 为准。
