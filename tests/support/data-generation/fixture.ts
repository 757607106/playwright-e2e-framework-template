import type { Dataset, DefinedRecipe } from './types';
import { datasetPath } from './store';
import { TestDataError } from './validation';

type Selection = { datasetId?: string; file?: string; directory?: string };
type Attach = (name: string, body: string) => Promise<void>;
/** Replay-only service. It deliberately has no generate/provider method. */
export class TestDataReader {
  constructor(private readonly attach: Attach) {}
  async load<T, S>(recipe: DefinedRecipe<T, S>, selection: Selection = {}): Promise<Dataset<T, S>> {
    const datasetId = selection.datasetId ?? process.env.DATASET_ID;
    if (selection.file && selection.datasetId) throw new TestDataError('CONFIG', 'Choose a dataset ID or a file, not both');
    if (!selection.file && !datasetId) throw new TestDataError('CONFIG', 'Set DATASET_ID or pass { datasetId } / { file }; regression never generates missing data');
    const dataset = recipe.load(selection.file ?? datasetPath(datasetId!, selection.directory));
    await this.attach(`test-data-${dataset.manifest.datasetId}`, JSON.stringify(dataset.manifest, null, 2));
    return dataset;
  }
}
