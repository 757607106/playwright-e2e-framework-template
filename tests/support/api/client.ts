import { expect, type APIRequestContext } from '@playwright/test';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiEnvelope<T> = { code?: string; message?: string; data?: T };

export type ApiCall<T> = {
  request: APIRequestContext;
  method: ApiMethod;
  path: string;
  data?: unknown;
  headers?: Record<string, string>;
  expectedStatus: number;
  expectedCode?: string;
  validate?: (body: unknown) => body is T;
};

/** The consumer supplies the response contract verified against its own API. */
export async function callApi<T>(options: ApiCall<T>): Promise<T> {
  const response = await options.request.fetch(options.path, {
    method: options.method,
    data: options.data,
    headers: options.headers,
  });
  expect(response.status(), `${options.method} ${options.path} HTTP status`).toBe(options.expectedStatus);
  const body: unknown = await response.json();
  if (options.expectedCode !== undefined) {
    expect(body && typeof body === 'object' && !Array.isArray(body)).toBeTruthy();
    const envelope = body as ApiEnvelope<unknown>;
    expect(envelope.code, `${options.method} ${options.path} business code`).toBe(options.expectedCode);
  }
  if (options.validate && !options.validate(body)) {
    throw new Error(`${options.method} ${options.path} response schema did not match`);
  }
  return body as T;
}
