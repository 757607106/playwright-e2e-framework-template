# 业务场景、计划与实现

## 从业务要求到可执行场景

根据用户目标选择场景，不自动扩展所有模块。新增业务先确认正常流程、关键权限或边界是否在请求范围内。期望结果来自需求和已确认规则；观察到的现状不自动等于正确要求。

每个场景记录：

- 稳定 `pageId/scenarioId`、角色、起始状态和真实需求引用；没有需求编号则明确无编号。
- 已确认的页面入口与定位依据、API 方法和响应校验依据。来源是需求文件、仓库代码或已脱敏的观察记录。
- 数据准备、返回 ID 登记位置、隔离方式、清理/恢复与结果验证。
- 用户动作和可观察的业务结果。有 API、审计记录或其他持久化通道时核对同一资源。
- 执行的环境范围、已完成的计划审查、尚未解决的信息和授权。

用 [计划模板](../assets/test-plan.md) 创建目标仓库的 `specs/<流程>.md`，删除不适用字段，保留未知项。不要保存整段响应、客户数据、认证 headers 或 storageState。

未知或共享环境探索只读；不以观察业务为由尝试提交、审批或删除。新写操作计划审查后才能执行；已有审查和用户授权覆盖当前任务时记录依据并继续，不再要求一轮形式确认。不能运行时仍可实现有契约支撑的代码，但明确未执行。

## 编写与复用

E2E 从 `tests/fixtures` 导入 `test/expect`，例：`tests/e2e/order.spec.ts` 用 `import { test, expect } from '../fixtures'`；更深目录调整相对路径。先检查既有 fixtures，业务步骤调用应用的页面/API/数据适配层。

使用稳定的 role、label 或已确认 test ID 定位；页面异步行为用可观察状态、Playwright 自动等待或对应响应等待。需要订阅响应时先建立等待再触发动作，不添加固定延时或强制点击。接口等待匹配实际路径和方法，不能宽泛匹配任意成功响应。

创建资源后立即登记；修改已有对象时先保存必要且可恢复的状态并登记精确恢复。测试断言关注结果，例如订单状态、金额、权限拒绝、审批历史；toast 只能是辅助证据。权限测试同时考虑界面和已确认的后端拒绝语义，不能把隐藏按钮当作接口权限成立。

UI-only 场景仍需验证有意义的结果；缺少后端通道时说明证据范围，不为达到某个等级编造接口。每条测试独立准备数据，不依赖上一条用例创建的对象或执行顺序。

可参考目标仓库 `examples/tests/lifecycle.spec.ts` 的实际 UI/API/清理结构，但本地演示保持 `coverageSupport`，不能冒充产品业务覆盖。

## 覆盖登记

实际类型以 `tests/coverage/page-coverage.ts` 为准。当前模板每个页面需要 `id/module/name/route/scenarios`，每个场景需要 `id/name/operations/level/requirementIds`；可选证据、边界、规则和 API 符号字段按需使用。

ID 以字母或数字开头，其余只能含字母、数字、点、下划线和连字符。页面 ID 在登记表唯一，同一页面场景 ID 唯一；标题可改，稳定 ID 不随文案变化。

```ts
// 将此 details 作为已实现的 test(...) 的第二个参数。
coverageScenario(['orders', 'submit-for-approval']);
```

此片段仅展示绑定语法，需要先在 `PAGE_COVERAGE` 登记该真实场景；不能将空测试提交或算作覆盖。`coverageScenario` 从 `tests/support/annotations` 导入，真实步骤必须实现并验证。

- L0/L1 表示可达或交互；L2 需要业务结果，L3/L4 用于有证据的连接流程，依据应用场景定义等级。
- 真实业务用 `coverageScenario`。登录 seed、框架检查等用 `coverageSupport('具体原因')`，不进入产品覆盖分母。排除项用 `coverageExclude('具体原因')`。
- 同一用例不能混合业务场景和 support/exclude 分类。分类不能代替执行，也不要为绕过检查把业务用例降为 support。
- 同一场景绑定的测试全部通过才标为 passed；混合未执行/跳过是 partial，重试通过是 flaky。发现或映射成功不代表测试通过。

## 可选官方 Agents

仅当用户要求使用官方测试 Agents 且当前宿主支持时读 `docs/agent-testing.md`。业务项目需一个可发现的安全 seed，使用统一认证 fixtures 和 support/exclude 分类，进入已确认安全页面并断言就绪。

使用 `npm run agents:init -- --project=chromium`（实际 project 以当前配置为准）；默认无参数会绑定 `local-example`，不能误用于真实业务。初始化只生成定义，不代表模型已执行任务；保留自定义定义。不要直接运行上游初始化覆盖项目适配策略。

按已有职责使用 planner 产出观察和计划、generator 实现已审查场景、healer 诊断指定失败。已有三者复用当前 runner、fixtures、清理、覆盖和报告，无需第二套通用浏览器 MCP。宿主不支持时由当前 agent 用可用工具完成相同工作，不安装无关服务。用户仅要求计划时不要启动生成或执行任务。
