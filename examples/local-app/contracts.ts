export type CounterResource = { id: string; value: number; label: string };
export function isCounterResource(body: unknown): body is CounterResource {
  return typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
    && 'value' in body && typeof body.value === 'number' && Number.isInteger(body.value)
    && 'label' in body && typeof body.label === 'string';
}
