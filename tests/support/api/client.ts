import { expect, type APIRequestContext } from '@playwright/test';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiEnvelope<T> = { code?: string; message?: string; data?: T };
type Options = {
  request: APIRequestContext;
  method: ApiMethod;
  path: string;
  data?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  expectedStatus: number;
  expectedCode?: string;
};
export type ApiCall<T> = Options & { validate: (body: unknown) => body is T; responseMode?: 'json' };
export function callApi<T>(options: ApiCall<T>): Promise<T>;
export function callApi(options: Options & { responseMode: 'empty' }): Promise<void>;
export function callApi(options: Options & { responseMode?: 'json' }): Promise<unknown>;

/** Typed results require a runtime contract; raw JSON stays unknown. */
export async function callApi(options: Options & { validate?: (body: unknown) => boolean; responseMode?: 'json' | 'empty' }): Promise<unknown> {
  const response = await options.request.fetch(options.path, {
    method: options.method, data: options.data, headers: options.headers, params: options.params,
  });
  try {
    expect(response.status(), `${options.method} response HTTP status`).toBe(options.expectedStatus);
    if (options.responseMode === 'empty') {
      if (options.expectedCode !== undefined) throw new Error('An empty response cannot have a business code');
      expect((await response.body()).length, 'Response must be empty').toBe(0);
      return;
    }
    const body: unknown = await response.json();
    if (options.expectedCode !== undefined) {
      const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
      expect(code, `${options.method} response business code`).toBe(options.expectedCode);
    }
    if (options.validate && !options.validate(body)) throw new Error(`${options.method} response schema did not match`);
    return body;
  } finally { await response.dispose(); }
}
