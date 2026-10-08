# 可重放的业务测试数据

框架提供独立的数据准备工具：**AI SDK + Zod + Faker → 字段与业务规则校验 → 保存批次 → Playwright fixture 重放 → 应用 factory 创建真实对象 → 按真实 ID 清理**。无需模型账号即可运行完整本地示例。

English quick start: run `npm run test:data` for the offline demonstration. Run `npm run data:init -- --name business` to scaffold a typed recipe, then `npm run data:generate -- --recipe tests/support/data/business.recipe.ts`. Use the printed dataset ID with `data:validate` / `data:inspect` and the shared `testData.load(recipe, { datasetId })` fixture. Opt into models only with `--mode llm`; configure `MODEL_NAME`, `API_BASE_URL`, `API_KEY` and the optional adapter/protocol/output mode in `.env` or `model.config.ts`. Regression only replays provisioned batches. Recipes and real API factories belong to the consuming application repository.

## 先运行完整示例

使用 Node.js 22.13+ 或 24，安装依赖和 Chromium 后执行：

```bash
npm run test:data
npm run test:data -- --seed 2026 --per-case 2
```

第一条命令准备 4 条数据并执行 4 个场景；第二条准备 8 条数据，每个场景重放两条。覆盖普通值、下边界、上边界和受控负例。正例通过真实本地 API 创建临时计数器，验证 UI 名称、初值、加一后的持久化结果，再精确删除；负例验证 API 拒绝输入。示例标记为 support，不计入任何产品的业务覆盖。

`npm test` 默认也运行这些用例。内置示例的离线数据准备在 Playwright 启动前的独立进程完成，不调用模型。`E2E_SKIP_EXAMPLES=true` 关闭示例及其自动准备；应用回归需要事先提供自己的批次。`test:data` 使用全部示例场景，不用 `--cases` 缩小其批次；独立的 `data:generate` 可选择场景。

查看可运行代码：[配方](../examples/data/counter.recipe.ts)、[接口 factory](../examples/data/counter.factory.ts)、[重放用例](../examples/tests/generated-data.spec.ts)。保留统一 fixtures、报告和 `resources` 清理机制。

## 在自己的业务仓库初始化

```bash
npm run data:init -- --name purchase
npm run data:generate -- --recipe tests/support/data/purchase.recipe.ts --seed 42 --per-case 2
```

初始化创建 `tests/support/data/purchase.recipe.ts`，已有文件不会被覆盖。起点包含标题、数量、以分为单位的价格、确定性计算的金额，以及正例、下边界和零数量负例。这是待替换的示范输入结构，不能直接当作你系统的接口契约。

使用者配置配方和应用 factory，框架核心保持通用。

| 配方字段 | 如何实现 |
| --- | --- |
| `id` / `version` | 稳定名称；修改 build、offline、业务规则或 mutation 代码后升级 version |
| `schema` | Zod 输入结构，建议 `z.strictObject`；使用可表达为 JSON Schema 的有限 JSON 类型 |
| `semantic.schema` | 模型被允许生成的字段，例如标题、描述、备注；严格限制字段与长度 |
| `semantic.prompt` / `version` | 合成数据要求和提示词版本；只写经过审查的合成业务上下文 |
| `semantic.offline(context)` | 无模型时的明确替代生成器，不是请求失败后的降级逻辑 |
| `build(context, semantic)` | 根据场景生成枚举、数值、边界、日期及计算字段 |
| `rules` | 带稳定 ID 的纯函数校验；校验领域约束、金额关系、日期顺序等 |
| `cases` | 稳定场景 ID、描述；负例指定 `expectedViolations` 与 `mutate` |

`context` 含 `faker`、`caseId`、从零开始的 `index`、`refDate`。每条数据使用独立且固定种子的 Faker 实例；相对日期使用固定参考时间。不要在配方里调用 `Date.now()`、`Math.random()`、共享 Faker、真实后端或读取生产数据。配方可包含多个依赖对象的候选字段，实际对象依赖由 factory 处理。

模型生成语义字段，Faker/代码生成结构字段，代码计算金额与日期关系，后端分配资源 ID 和真实状态。测试预期从已审查的需求独立定义，不让同一个模型同时生成输入和判定答案。

## 生成、检查和冻结

```bash
npm run data:generate -- --recipe tests/support/data/purchase.recipe.ts --cases normal,minimum --per-case 3 --seed 2026
npm run data:validate -- --recipe tests/support/data/purchase.recipe.ts --dataset <输出的datasetId>
npm run data:inspect -- --recipe tests/support/data/purchase.recipe.ts --dataset <输出的datasetId>
```

命令输出批次 ID、文件位置、来源、场景、行数和模型 token 信息，不输出业务 payload。实际输入和接受的语义输出保存在 `artifacts/test-data/<datasetId>.json`，可在本地编辑器审查。该目录被 Git 忽略；不要提交私有业务数据，也不要为检查批次把数据上传公共仓库。批次是包含 manifest 与 rows 的 JSON 文件，方便在内部 CI 工件存储中分发。

保存采用内容寻址和原子发布：相同内容复用同一个文件，已有批次不会被覆盖。修改内容后应重新生成新批次。manifest 记录 recipe/schema/prompt 指纹、配方与生成器版本、Faker 版本、模型标识、seed、固定参考时间、限额、行数和内容校验值。每条 row 记录 caseId、序号、修正尝试次数、语义结果、payload 和预期违反的规则。

重放检查完整性、版本、输入结构、场景归属和业务规则。缺失、损坏或不兼容会失败，不会自动请求模型。内容校验用于检测变化与损坏，不提供数字签名或数据来源认证。业务规则实现变更需要升级 recipe version，自动指纹不能识别函数闭包内的所有行为变化。

固定 seed 只保证同版 Faker 和确定性代码的可重复生成，不保证模型重复返回同一内容。LLM 数据的可复现依据是保存的实际输出。升级 Faker 后重新生成会产生新批次；已经保存且仍符合配方的输入可以继续重放。

## 显式接入模型

共享模型配置与业务数据功能独立。复制 `.env.example` 到 `.env`，填写模型名称、API 前缀和密钥：

```dotenv
MODEL_NAME=your-model-id
API_BASE_URL=http://127.0.0.1:8000/v1
API_KEY=
MODEL_PROVIDER=openai-compatible
MODEL_PROTOCOL=chat-completions
MODEL_OUTPUT_MODE=schema
```

替换示例模型 ID 和地址；密钥按服务要求提供。本地无鉴权服务可以留空。`BASE_URL` 是被测应用地址，`API_BASE_URL` 是模型 API 前缀。使用服务文档中的前缀，框架按协议追加请求路径，不填写完整的 `/chat/completions` 路径。非空环境变量覆盖 `model.config.ts` 中的默认值，CI 环境值优先于 `.env`。完整字段、优先级、原生供应商和自定义适配器见[配置指南](configuration.md)。

```bash
npm run model:check
npm run data:generate -- --recipe tests/support/data/purchase.recipe.ts --mode llm --per-case 2 --max-attempts 3 --timeout-ms 30000 --total-timeout-ms 120000 --max-output-tokens 1024
```

`model:check` 只检查配置并初始化适配器，不发送模型请求，不代表服务在线验证。`--list` 列出内置协议；`--config path.ts` 指定配置模块，生成时对应 `--model-config path.ts`。离线模式不加载模型配置，模型模式失败不会自动改用 Faker。

默认兼容接口使用 Chat Completions + JSON Schema。只支持 JSON mode 的服务选择 `MODEL_OUTPUT_MODE=json`；只支持普通文本的服务选择 `text`，返回一个完整 JSON 值或一个 JSON 代码块。每种模式都执行本地字段校验。内置 `openai` 支持 Responses、Chat Completions 和传统 Completions（仅 text），`anthropic` 使用 Messages，`google` 使用 Generate Content。模型名称直接传给服务，没有硬编码名单；具体部署须支持所选协议和输出模式。其他文本模型服务通过 `model.config.ts` 注册 SDK 适配器。

共享客户端使用 [AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) 的结构化输出接口。数据适配器只添加合成语义字段的策略。manifest 记录供应商、模型、协议和输出模式；密钥、服务地址、请求头和原始模型错误正文不会进入摘要或错误日志。提示词和语义字段会发送给所选服务，应只使用允许发送的合成上下文。

适配层不向模型提供业务工具，不允许其执行接口或删除数据。原生 SDK 可以用结构化格式或内部 JSON 结果工具编码返回值，这不会执行应用业务操作。字段/业务规则不匹配时最多尝试 3 次，修正反馈仅含规则 ID 和路径；鉴权、网络及服务错误直接失败，SDK 隐式请求重试关闭。默认每次 30 秒、整批 120 秒、每条最多 1024 输出 token；上限分别为 60 秒、300 秒、32768 token。每场景 1–100 条，整批最多 1000 条；逐条顺序请求。`totalTokens` 包含服务报告的失败校验尝试；缺失 usage 时 `usageComplete=false`，该数字不是完整计费保证。

独立准备脚本可使用 `loadModelClient()` 与 `createSemanticProvider(client)`，或直接用 `createAiSdkProvider(model, { name, model }, outputMode)` 注入 SDK 模型，再调用 `recipe.generate({ provider })` 和 `saveDataset`。注册供应商后现有 CLI 也能直接使用，无需修改 fixtures 或 runner。自定义生成器也可实现类型化 `SemanticProvider` 接口，并尊重 `AbortSignal`；超时会停止框架等待，无法强制结束忽略取消信号的外部工作。

## 正例与受控负例

先生成并校验合法基础数据，再用代码修改指定字段：

```ts
{
  id: 'invalid-quantity',
  description: 'Zero quantity is rejected',
  expectedViolations: ['quantity-range'],
  mutate: input => ({ ...input, quantity: 0, totalCents: 0 }),
}
```

上例金额关系仍成立，只违反数量规则。若意外同时违反另一规则，整个生成过程失败。这样不会把所有非法数据过滤掉，也不会接受模型随机产生的错误。

`schema` 定义候选请求可表达的结构；需要作为负例的业务限制放在带 ID 的 `rules` 中。例如 schema 允许整数数量，`quantity-range` 要求 1–20。若要测试类型错误或缺失字段，schema 应显式容纳这种候选形态，再由命名规则区分；不要用类型断言绕开校验。复杂无效请求可以定义单独配方。

## 在统一 fixture 中重放

```ts
import { test, expect } from '../fixtures';
import { coverageScenario } from '../support/annotations';
import { recipe } from '../support/data/purchase.recipe';
import { createPurchase, readPurchase } from '../support/data/purchase.factory';

test('提交采购单', coverageScenario(['purchase-page', 'purchase-submit']), async ({ testData, request, resources, runId }) => {
  const dataset = await testData.load(recipe);
  const row = dataset.rows.find(candidate => candidate.caseId === 'normal');
  expect(row, 'A normal case must be provisioned').toBeDefined();
  if (!row) throw new Error('Missing normal data');
  const created = await createPurchase(row.payload, { request, resources, runId });
  const persisted = await readPurchase(request, created.id);
  // Replace with independently reviewed business assertions and required UI actions.
  expect(persisted.totalCents).toBe(row.payload.quantity * row.payload.unitPriceCents);
});
```

上面展示接入位置；应用 factory、接口、覆盖 ID 和业务结果断言必须按你的真实系统实现。`DATASET_ID` 指定预先准备好的批次 ID。也可以使用 `testData.load(recipe, { datasetId })`，或 `{ file: '/内部工件绝对路径/batch.json' }`；指定 ID 可用 `directory` 覆盖默认目录。fixture 把 manifest 附到用例报告，默认不附输入正文。用例仍应把每个必要场景登记为产品覆盖，并确认对应数据已配置；不要让空数组循环变成假通过。

factory 先创建依赖对象，每收到真实 ID 立即登记 `resources.track`，随后用返回 ID 创建后续对象。不要把 JSON 中的占位引用当作数据库外键，不要伪造“已审批”等状态；调用真实业务操作达到目标状态。清理按反序处理精确 ID，未解决项保持失败。冻结批次可重复使用，runId 和后端对象 ID 每次运行重新产生。

## CI 与问题定位

探索/准备阶段显式调用模型并审查输出，将选中的 JSON 批次上传内部工件存储。正式回归下载同一文件，配置 DATASET_ID 或传入 file，再执行现有 Playwright 命令。不要在应用测试里调用 `recipe.generate`，不要把模型密钥作为正式回归的必需配置。

CI 默认示例全程离线，不要求外部模型服务。报告准备只归档报告目录，会保留 `artifacts/test-data`。正式业务批次可与业务回归使用不同的保留与访问策略。

| 错误代码 | 含义与下一步 |
| --- | --- |
| `CONFIG` | 参数、配方、选择范围或模型配置不完整；修正配置 |
| `VALIDATION` | 输入结构/业务约束不满足，或负例超出声明；依据规则修正配方或语义生成要求 |
| `PROVIDER` | 服务调用失败；私下核查模型、鉴权、地址与协议 |
| `TIMEOUT` | 请求、整批超时或取消；缩小批次或调整受限预算 |
| `REPLAY` | 文件缺失、损坏或配方不兼容；提供原批次或重新生成并审查 |
| `STORAGE` | 文件过大、不可写或文件系统不支持原子硬链接；修正存储目录，勿覆盖原批次 |

模型数据通过静态校验不能证明业务通过；最终证据来自真实接口、页面结果、后端状态和清理结果。没有真实模型账号时，可用真实 SDK 配合模拟 HTTP 验证适配链路，但这不等于某个服务的在线兼容性验证。
