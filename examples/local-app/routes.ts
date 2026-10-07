/** Only the bundled localhost application uses these routes. */
export const EXAMPLE_ROUTES = {
  session: '/api/session',
  resources: '/api/resources',
  resource: (id: string) => `/api/resources/${encodeURIComponent(id)}`,
};
