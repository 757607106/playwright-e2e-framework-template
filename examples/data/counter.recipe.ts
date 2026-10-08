import { z } from 'zod';
import { defineDataRecipe } from '../../tests/support/data-generation';

const semanticSchema = z.strictObject({
  label: z.string().min(1).max(60).describe('A fictional, non-personal inventory counter name, in Chinese or English'),
});
export const counterInputSchema = z.strictObject({ label: z.string(), initialValue: z.number().int() });
export type CounterInput = z.infer<typeof counterInputSchema>;
export const recipe = defineDataRecipe({
  id: 'counter', version: '1', schema: counterInputSchema,
  semantic: {
    schema: semanticSchema, version: '1',
    prompt: 'Generate a fictional inventory counter label for a local testing demonstration. Include meaningful variations. No people, credentials, identifiers or real companies.',
    offline: ({ faker }) => ({ label: `演示库存 ${faker.commerce.product()}` }),
  },
  build: ({ faker, caseId }, semantic) => ({
    label: semantic.label,
    initialValue: caseId === 'minimum' ? 0 : caseId === 'maximum' ? 100 : faker.number.int({ min: 1, max: 99 }),
  }),
  rules: [
    { id: 'label-length', check: payload => payload.label.trim().length >= 1 && payload.label.length <= 60 },
    { id: 'initial-range', check: payload => payload.initialValue >= 0 && payload.initialValue <= 100 },
  ],
  cases: [
    { id: 'normal', description: 'An ordinary counter increments and persists its value' },
    { id: 'minimum', description: 'The minimum initial value is accepted' },
    { id: 'maximum', description: 'The maximum initial value is accepted' },
    { id: 'below-minimum', description: 'An initial value below zero is rejected', expectedViolations: ['initial-range'], mutate: payload => ({ ...payload, initialValue: -1 }) },
  ],
});
