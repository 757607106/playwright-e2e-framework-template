# Configuration reference

[Architecture](architecture.md) · [Application adoption](adoption-guide.md) · [Business data](test-data.md)

The framework separates application execution, shared model access and data preparation. `.env.example` contains common environment fields; `model.config.ts` contains typed model defaults and extension registrations. No model account is needed for offline preparation or ordinary dataset replay.

## Shared model connection

| Environment field | TypeScript field | Meaning | Default |
| --- | --- | --- | --- |
| `MODEL_NAME` | `model` | Exact model ID/deployment name accepted by the selected service | Required in model mode; no model is guessed |
| `API_BASE_URL` | `baseURL` | Absolute HTTP(S) API prefix; the adapter appends its operation route | Required for compatible/private services; native SDK providers have defaults |
| `API_KEY` | `apiKey` | Service credential | Required for native cloud providers; optional for unauthenticated compatible services |
| `MODEL_PROVIDER` | `provider` | Registered adapter ID | `openai-compatible` |
| `MODEL_PROTOCOL` | `protocol` | Request protocol exposed by the selected adapter | Adapter default |
| `MODEL_OUTPUT_MODE` | `outputMode` | `schema`, `json` or `text` | First supported mode for the protocol; `.env.example` explicitly selects `schema` |
| — | `headers` | Additional request headers | None; put secret values in environment references |
| — | `providerOptions` | SDK-specific, namespaced JSON options | None |

There are no feature-prefixed model settings or implicit vendor-specific credential fallbacks. Native providers require the canonical `API_KEY`; switching `MODEL_PROVIDER` does not silently read another vendor's environment key. Each SDK appends its own route: supply an API prefix, not a full `/chat/completions` or `/responses` endpoint. `BASE_URL` is the application URL and is independent of `API_BASE_URL`.

Process environment/CI values take precedence over `.env`; nonempty canonical model environment values take precedence over `model.config.ts` defaults. Empty environment values leave defaults intact. Provider defaults apply last. Model commands load `.env` quietly. `readModelConfig` and `createModelClient` do not load files into the process environment.

URLs cannot contain user/password, query parameters or fragments. HTTP endpoints on private networks and localhost are supported; choose HTTPS when needed for transport confidentiality. Providers that need query-based authentication, additional deployment fields or token exchange belong in a registered SDK adapter; its trusted factory owns that protocol's authentication.

## Providers and protocols

| `MODEL_PROVIDER` | `MODEL_PROTOCOL` | Default API prefix | Output modes |
| --- | --- | --- | --- |
| `openai-compatible` | `chat-completions` (default) | Supply `API_BASE_URL` | `schema`, `json`, `text` |
| `openai` | `responses` (default) | `https://api.openai.com/v1` | `schema`, `json`, `text` |
| `openai` | `chat-completions` | Same | `schema`, `json`, `text` |
| `openai` | `completions` (legacy) | Same | `text` |
| `anthropic` | `messages` (default) | `https://api.anthropic.com/v1` | `schema`, `text` |
| `google` | `generate-content` (default) | `https://generativelanguage.googleapis.com/v1beta` | `schema`, `json`, `text` |
| Registered custom ID | Declared by the adapter | Declared default or supplied prefix | Declared by the adapter |

The protocol is independent of the model name. Use any text model ID accepted by the service; the framework has no hardcoded model list. The selected deployment must support the chosen strategy. OpenAI-compatible means a matching request/response contract, not a promise that every service implements every OpenAI feature. A compatible Responses endpoint can use `MODEL_PROVIDER=openai`, `MODEL_PROTOCOL=responses` and a custom prefix/key. Services with additional protocol requirements use the extension interface below.

`schema` asks the SDK for schema-constrained output (or its native equivalent). `json` asks for JSON syntax and validates fields locally. `text` sends no JSON response-format restriction, includes the schema in the prompt, parses one complete JSON value or one fenced JSON block, and validates fields locally. Prose surrounding JSON is rejected. No output mode automatically switches to another on failure. Embeddings, image and audio generation are not part of this structured text API.

## Connect a compatible service

Copy `.env.example` to `.env`. Set `MODEL_NAME` to your service's actual ID, `API_BASE_URL` to its documented API prefix and `API_KEY` if authentication is required. These three fields describe the connection; adapter defaults select Chat Completions and schema mode.

An unauthenticated local server exposing Chat Completions can use:

```dotenv
MODEL_NAME=your-model-id
API_BASE_URL=http://127.0.0.1:8000/v1
API_KEY=
MODEL_PROVIDER=openai-compatible
MODEL_PROTOCOL=chat-completions
MODEL_OUTPUT_MODE=schema
```

Replace the model ID and endpoint with verified service values. For a JSON-only service use `MODEL_OUTPUT_MODE=json`; for a text-only service use `text`. Both still run the same local schema and business-rule validation.

```bash
npm run model:check
npm run data:generate -- --recipe tests/support/data/purchase.recipe.ts --mode llm --per-case 1
```

`model:check` validates settings and initializes the adapter **without sending a model request**. Its output contains only provider/model/protocol/output mode and `onlineVerified=false`. It does not validate account permissions, server availability or remote model capabilities. `--list` lists built-in capabilities without credentials. `--config path.ts` loads a specified trusted model config; use `--model-config path.ts` with `data:generate` for the same selection.

## Connect native providers

For OpenAI, set `MODEL_NAME` and `API_KEY`, then choose:

```dotenv
MODEL_PROVIDER=openai
MODEL_PROTOCOL=responses
MODEL_OUTPUT_MODE=schema
API_BASE_URL=
```

An empty prefix uses the official default unless a prefix was defined in `model.config.ts`. Use `chat-completions` only for a matching service/model. For legacy Completions explicitly select `MODEL_PROTOCOL=completions` and `MODEL_OUTPUT_MODE=text`.

For Anthropic, select `MODEL_PROVIDER=anthropic`, leave `MODEL_PROTOCOL` empty (defaults to `messages`), and set the actual model name and canonical key. For Google, select `MODEL_PROVIDER=google` and leave the protocol empty (defaults to `generate-content`). Native adapters accept explicit prefix overrides. Choose only a supported output mode from the table.

Provider details are delegated to the installed [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai), [Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) and [Google](https://ai-sdk.dev/providers/ai-sdk-providers/google) SDK adapters. Registry tests verify request contracts with mocked HTTP; real service access requires a separate online preparation check.

## Typed defaults and provider extension

Keep nonsecret defaults and advanced options in the root `model.config.ts`:

```ts
import { createModelRegistry, defineModelConfig } from './tests/support/llm';

export default defineModelConfig({
  provider: 'openai-compatible',
  outputMode: 'json',
  headers: { 'x-business-scope': 'synthetic-testing' },
});
export const providers = createModelRegistry();
```

Environment values override these fields; remove an explicit `MODEL_OUTPUT_MODE=schema` environment setting when you want this `json` default to apply. Secrets remain in `.env` or CI secret variables. For a provider-specific SDK option, supply `providerOptions: { providerNamespace: { optionName: value } }` using the installed SDK's documented namespace/options. Invalid configuration is rejected with field names, not values.

A private gateway using the compatible SDK can register its own protocol and default without changing core files:

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createModelRegistry, defineModelConfig } from './tests/support/llm';

export default defineModelConfig({ provider: 'company-gateway' });
export const providers = createModelRegistry().register('company-gateway', {
  defaultProtocol: 'chat-completions',
  protocols: { 'chat-completions': ['json', 'text'] },
  requiresApiKey: true,
  createModel: (config, context) => createOpenAICompatible({
    name: config.provider,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
    fetch: context.fetch,
  }).chatModel(config.model),
});
```

Set `MODEL_PROVIDER=company-gateway`, `MODEL_NAME`, `API_BASE_URL`, `API_KEY`, and select `json` or `text`. Additional SDKs return their own `LanguageModel` from `createModel`. Custom protocols can implement the AI SDK language-model interface. Factories return explicit SDK instances (v2/v3/v4), not string aliases that implicitly select AI Gateway credentials. Provider IDs are unique and existing registrations cannot be overwritten. Registries are per-instance; one consumer's registration does not modify another's defaults.

An independent preparation script can use `await loadModelClient()` and pass the result to `createSemanticProvider` from `tests/support/data-generation/provider`. Or call `createModelClient(explicitConfig, { registry, fetch })` for direct configuration/testing. `generateObject` requires a JSON Schema-representable Zod schema, an `AbortSignal` and a bounded `maxOutputTokens`; a general-purpose caller owns its request deadline. The data engine supplies per-request and total deadlines, validation repair and usage accounting. Model calls belong in preparation scripts.

## Application and runner settings

| Field | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | Unset in code; `.env.example` uses localhost | Target application origin/prefix |
| `TEST_WORKERS` | `1` | Positive integer worker count |
| `E2E_ISOLATED_WORKERS` | `false` | Required acknowledgment for multiple workers; independent accounts/data must already exist |
| `TEST_TIMEOUT` | `30000` | Positive test timeout in milliseconds |
| `EXPECT_TIMEOUT` | `10000` | Positive assertion timeout in milliseconds |
| `HEADLESS` | `true` | `false` shows browser windows |
| `PLAYWRIGHT_TRACE` | `retain-on-failure` | `off`, `on`, `retain-on-failure`, `on-first-retry`, `retain-on-failure-and-retries` |
| `PLAYWRIGHT_SCREENSHOT` | `only-on-failure` | `off`, `on`, `only-on-failure` |
| `PLAYWRIGHT_VIDEO` | `retain-on-failure` | `off`, `on`, `retain-on-failure`, `on-first-retry` |
| `REPORT_ENV` | Derived from application URL | Label for archived reports |
| `REPORT_HISTORY_LIMIT` | `20` | Maximum previous-run archives; finite values are floored/clamped to zero, invalid values use 20 |
| `E2E_SKIP_EXAMPLES` | `false` | `true` disables localhost projects and their preparation |
| `EXAMPLE_PORT` | `4173` | Local example port, integer `1024..65535`; occupied ports fail |
| `DATASET_ID` | Unset | Reviewed batch ID used by `testData.load(recipe)` |

Application login fields are consumer-owned; implement their validation in the authentication adapter. Explicit `testData.load(recipe, { datasetId })` or `{ file }` takes precedence over the default batch selection. Default storage is `artifacts/test-data`; `{ directory }` selects another location for an ID. Missing batches fail instead of being generated.

`E2E_RUN_ID`, `E2E_EXAMPLE_DATASET` and `E2E_REPORT_LOCK_TOKEN` are execution bookkeeping, not ordinary connection settings. The launcher prepares the example batch path and manages lock ownership. Do not manually share a lock token between independent runs. Authentication state, local environments and all generated artifacts stay out of Git.

## Preparation parameters

Preparation-specific limits are CLI/API options rather than model connection fields:

| CLI option | Default | Allowed range/meaning |
| --- | --- | --- |
| `--mode` | `offline` | `offline` or explicit `llm` |
| `--seed` | `42` | Integer `0..4294967295` |
| `--per-case` | `1` | Integer `1..100`; maximum 1000 rows per batch |
| `--ref-date` | `2026-01-01T00:00:00.000Z` | ISO UTC timestamp including milliseconds |
| `--max-attempts` | `3` | Integer `1..3`; validation attempts, not transport retries |
| `--timeout-ms` | `30000` | Integer `1..60000` per request |
| `--total-timeout-ms` | `120000` | Integer `1..300000` per batch |
| `--max-output-tokens` | `1024` | Integer `64..32768` per request |

`--recipe`, `--cases`, `--directory`, `--model-config`, `--dataset` and `--file` select application inputs or artifacts. Replay rejects generation options; offline generation rejects `--model-config`. Run `npm run data:generate -- --help` for the full command syntax and consult the [data guide](test-data.md) for examples.
