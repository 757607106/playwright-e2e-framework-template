import type { DataRecipe, DefinedRecipe } from './types';
import { generateDataset } from './generate';
import { loadDataset } from './store';
import { validateRecipe } from './validation';

export function defineDataRecipe<T, S>(definition: DataRecipe<T, S>): DefinedRecipe<T, S> {
  validateRecipe(definition);
  return {
    ...definition,
    generate: options => generateDataset(definition, options),
    load: file => loadDataset(definition, file),
  };
}
export { generateDataset } from './generate';
export { datasetPath, saveDataset, loadDataset } from './store';
export { TestDataError } from './validation';
export type { DataContext, DataCase, DataRecipe, Dataset, DatasetRow, DefinedRecipe, GenerateOptions, SemanticProvider } from './types';
