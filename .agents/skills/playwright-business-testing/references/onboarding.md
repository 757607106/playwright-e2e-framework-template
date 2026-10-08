# 应用接入

首次接入时读本文；已有应用只补当前任务需要的内容。本文中的路径相对目标应用仓库，先核对实际文件和脚本。

## 验证模板与切换目标

首次使用准备 Node.js 22 或 24。保留 lockfile，用 `npm ci` 安装，再执行 `npx playwright install chromium`。未经用户要求不升级依赖或更换包管理器。

如需建立模板基线，在修改目标配置前执行 `npm run quality:ci` 和 `npm test`。默认 `chromium` 发现 `tests/e2e/**/*.spec.ts`；`local-example` 启动本机演示服务。演示通过仅证明框架行为。

应用接入时将 `.env.example` 复制为忽略的 `.env`，保留已有本地设置，配置真实 `BASE_URL`、`E2E_SKIP_EXAMPLES=true`、`TEST_WORKERS=1`。密码来自本地环境或 CI secrets，不写入源码、Skill、计划或日志。不为创建 `.env` 打印已有配置。

`E2E_SKIP_EXAMPLES=true` 只关闭 `local-example`。`tests/e2e/demo.spec.ts` 仍会被 `chromium` 发现；用业务用例替换时同时移除其 `demo/increment` 覆盖项，检查其他引用。不要将演示改成真实业务后继续沿用演示分类。

## 应用适配层

| 文件或目录 | 内容 |
| --- | --- |
| `tests/fixtures/index.ts`、同目录的业务扩展 | 从统一入口暴露登录与业务 fixtures |
| `tests/support/api/routes.ts` 及业务模块 | 已验证的方法、路由、请求参数与响应校验 |
| `tests/support/page-actions/` | 按业务含义组织的页面定位与操作 |
| `tests/support/data/` | 通过 API 或 UI 准备数据，返回准确 ID |
| `tests/e2e/` | 可发现的业务 `.spec.ts` |
| `tests/coverage/page-coverage.ts` | 稳定页面与场景登记 |
| `specs/` | 已审查的测试计划和证据来源 |

复用 `tests/support/api/client.ts`、资源跟踪与 reporters，框架模块不反向导入这些业务适配模块。只在有实际业务用途时创建目录。

## 登录与身份

先检查应用现有认证机制。参考目标仓库的 `examples/tests/fixtures.ts`：扩展 worker 范围的 `workerStorageState`，在独立上下文执行真实 UI 或 API 登录，断言认证成功后读取状态，并在 `finally` 关闭上下文。

Cookie/localStorage 可由 `storageState` 复用；sessionStorage 需应用自己的初始化逻辑。独立 API 域名、Bearer token 或其他认证需已验证的 request/header 适配，不能假设登录 cookie 自动覆盖所有接口。

扩展后的 `test/expect` 要从 `tests/fixtures` 统一入口导出。直接在 `index.ts` 扩展原 base，或把通用 fixtures 提取为同目录 `base.ts` 后让业务扩展依赖它；不要让 `index.ts` 和业务扩展互相导入。已有实现可继续使用。

重新组织出口时检查本地示例和 `scripts/verify-lifecycle.cjs` 等框架自检的导入。当前 lifecycle harness 的临时配置不提供应用 `BASE_URL`；若 probes 继续导入已认证的业务入口，可能先因登录失败而无法生成清理账本。提取通用 `base.ts` 后可让这类通用 probes 引用它，真实业务 E2E 仍从统一入口导入。保持 framework probes 不依赖业务登录；不要吞掉登录错误或在缺环境时悄悄让业务测试匿名执行。

每条测试仍使用独立 BrowserContext。默认一个 worker。需要并行才使用 `workerInfo.parallelIndex` 分配独立身份和数据域；实现完成后设置 `TEST_WORKERS` 和 `E2E_ISOLATED_WORKERS=true`，该开关不会分配账号。只读场景可沿用已存在的 setup project，避免对同一项目重复配置 setup 登录和 worker 登录。

## 接口契约

为每个实际调用确认方法、路由、参数、body、预期 HTTP 状态、业务状态与响应 schema，记录契约来源。响应从 `unknown` 用类型守卫校验后再访问字段；不要用类型断言冒充运行时校验。

`callApi`：传 `validate` 才返回类型化 JSON；未传时为 `unknown`。`expectedCode` 仅针对顶层字符串 `code`，其他 envelope 由应用校验器处理。204 或其他确认无 body 的响应使用 `responseMode: 'empty'` 并省略 `expectedCode`。helper 会释放 APIResponse，调用方保留解析后的数据。

不要把本机演示的状态码或 `EXAMPLE_ROUTES` 用作真实业务契约。没有 API 文档时可在授权范围内检查页面网络证据；缺少确认则记录未知项。

## 数据生命周期

准备函数返回后端真实 ID；需要名称时包含 `runId`，不能依赖共享固定名称。创建完成后立即登记，再检查业务字段：

```ts
resources.track({ kind: 'order', id: created.id }, async ({ id }) => {
  await deleteOrderById(request, id);
  await assertOrderAbsent(request, id);
});
```

这里的 `created`、删除与检查函数由应用的已确认契约实现，片段不是可独立执行的业务用例。禁止按名称前缀、时间范围或整个列表扩大删除。若准备多个依赖对象，逐个创建和登记；teardown 会逆序清理。

无法删除的对象需事先明确测试沙箱重置或精确恢复方式。真实审批、通知、扣款等不可逆副作用不能因存在数据库删除接口就视为可清理；先设计隔离方式与执行范围。

fixture 会在断言失败时尝试清理，清理失败会使测试失败并报告账本。强制终止或创建已成功但尚未收到 ID 的情况不能保证自动恢复；依据已知 ID 和现有账本恢复，不推测对象 ID。详见目标仓库 `docs/adoption-guide.md` 的恢复与超时说明。

## 第一条用例完成标准

选择用户当前优先的一条流程，完成真实登录、准确准备与登记、页面操作、业务结果断言、可用的后端核对和精确清理。运行质量检查与目标用例并查看证据后再扩大范围。环境不可用时交付可确认部分与待确认项，不把本地演示结果替代业务验证。
