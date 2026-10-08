import { createModelRegistry, defineModelConfig } from './tests/support/llm';

// Optional nonsecret defaults. .env / CI environment variables override these fields.
// model, baseURL and apiKey map to MODEL_NAME, API_BASE_URL and API_KEY.
export default defineModelConfig({});

// Register a private or additional AI SDK provider here; core modules remain unchanged.
export const providers = createModelRegistry();
