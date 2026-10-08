import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EXAMPLE_ROUTES } from './routes';

// Ephemeral, loopback-only application for framework demonstrations.
const sessions = new Set<string>();
const resources = new Map<string, { owner: string; value: number; label: string }>();
function json(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}
async function createInput(request: IncomingMessage): Promise<{ label: string; initialValue: number } | undefined> {
  let text = '';
  for await (const chunk of request) {
    text += String(chunk);
    if (Buffer.byteLength(text) > 8192) return undefined;
  }
  if (!text) return { label: 'Counter', initialValue: 0 };
  let input: unknown;
  try { input = JSON.parse(text) as unknown; } catch { return undefined; }
  // The demo backend validates independently from the generation recipe.
  if (typeof input !== 'object' || input === null || !('label' in input) || typeof input.label !== 'string'
    || input.label.trim().length === 0 || input.label.length > 60 || !('initialValue' in input)
    || typeof input.initialValue !== 'number' || !Number.isInteger(input.initialValue) || input.initialValue < 0 || input.initialValue > 100) return undefined;
  return { label: input.label, initialValue: input.initialValue };
}
async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/health') return json(response, 200, { ready: true });
  if (url.pathname === EXAMPLE_ROUTES.session && request.method === 'POST') {
    const session = randomUUID();
    sessions.add(session);
    response.setHeader('Set-Cookie', `example_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
    return json(response, 201, { authenticated: true });
  }
  if (url.pathname === '/' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="en"><title>Framework example</title>
      <main><h1>Counter</h1><h2 aria-label="Resource label"></h2><output aria-label="Count">Loading</output><button disabled>Increment</button><p role="alert"></p></main>
      <script>
      const resourceId = new URLSearchParams(location.search).get('resourceId');
      const endpoint = '/api/resources/' + encodeURIComponent(resourceId || '');
      const button = document.querySelector('button');
      const count = document.querySelector('output');
      async function refresh(method) {
        button.disabled = true;
        try {
          const response = await fetch(endpoint, { method });
          if (!response.ok) throw new Error('Request failed');
          const body = await response.json();
          count.textContent = String(body.value);
          document.querySelector('h2').textContent = body.label;
        } catch (error) { document.querySelector('[role=alert]').textContent = error.message; }
        finally { button.disabled = false; }
      }
      button.addEventListener('click', () => refresh('PATCH'));
      if (resourceId) refresh('GET');
      else count.textContent = 'Prepare a resource using the API';
      </script></html>`);
    return;
  }
  const owner = request.headers.cookie?.split('; ').find(cookie => cookie.startsWith('example_session='))?.slice('example_session='.length);
  if (!owner || !sessions.has(owner)) return json(response, 401, { code: 'UNAUTHENTICATED' });
  if (url.pathname === EXAMPLE_ROUTES.resources && request.method === 'POST') {
    const input = await createInput(request);
    if (!input) return json(response, 422, { code: 'INVALID_INPUT' });
    const id = randomUUID();
    resources.set(id, { owner, value: input.initialValue, label: input.label });
    return json(response, 201, { id, value: input.initialValue, label: input.label });
  }
  const match = /^\/api\/resources\/([a-f0-9-]+)$/.exec(url.pathname);
  const id = match?.[1];
  const resource = id ? resources.get(id) : undefined;
  if (!id || !resource || resource.owner !== owner) return json(response, 404, { code: 'NOT_FOUND' });
  if (request.method === 'DELETE') { resources.delete(id); return json(response, 204); }
  if (request.method === 'PATCH') resource.value += 1;
  else if (request.method !== 'GET') return json(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  return json(response, 200, { id, value: resource.value, label: resource.label });
}
const server = createServer((request, response) => {
  handle(request, response).catch(() => json(response, 500, { code: 'INTERNAL_ERROR' }));
});
server.listen(Number(process.env.EXAMPLE_PORT || 4173), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
