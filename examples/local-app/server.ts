import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EXAMPLE_ROUTES } from './routes';

// Ephemeral, loopback-only application for framework demonstrations.
const sessions = new Set<string>();
const resources = new Map<string, { owner: string; value: number }>();
function json(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}
const server = createServer((request, response) => {
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
    return response.end(`<!doctype html><html lang="en"><title>Framework example</title>
      <main><h1>Counter</h1><output aria-label="Count">Loading</output><button disabled>Increment</button><p role="alert"></p></main>
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
        } catch (error) { document.querySelector('[role=alert]').textContent = error.message; }
        finally { button.disabled = false; }
      }
      button.addEventListener('click', () => refresh('PATCH'));
      if (resourceId) refresh('GET');
      else count.textContent = 'Prepare a resource using the API';
      </script></html>`);
  }
  const owner = request.headers.cookie?.split('; ').find(cookie => cookie.startsWith('example_session='))?.slice('example_session='.length);
  if (!owner || !sessions.has(owner)) return json(response, 401, { code: 'UNAUTHENTICATED' });
  if (url.pathname === EXAMPLE_ROUTES.resources && request.method === 'POST') {
    const id = randomUUID();
    resources.set(id, { owner, value: 0 });
    return json(response, 201, { id, value: 0 });
  }
  const match = /^\/api\/resources\/([a-f0-9-]+)$/.exec(url.pathname);
  const id = match?.[1];
  const resource = id ? resources.get(id) : undefined;
  if (!id || !resource || resource.owner !== owner) return json(response, 404, { code: 'NOT_FOUND' });
  if (request.method === 'DELETE') { resources.delete(id); return json(response, 204); }
  if (request.method === 'PATCH') resource.value += 1;
  else if (request.method !== 'GET') return json(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  return json(response, 200, { id, value: resource.value });
});
server.listen(Number(process.env.EXAMPLE_PORT || 4173), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
