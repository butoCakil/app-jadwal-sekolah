import type { Gudang } from './cadangan';
import { bacaAi, bacaDrafMentah, bacaSinkron, semuaDatasetMentah, simpanDataset, simpanDraf, tulisAi, tulisSinkron } from './simpan';

/** Gudang cadangan yang membaca dan menulis IndexedDB peramban ini. */
export const gudangPeramban: Gudang = {
  bacaDraf: bacaDrafMentah,
  tulisDraf: simpanDraf,
  semuaDataset: semuaDatasetMentah,
  tulisDataset: simpanDataset,
  bacaAi: (k) => bacaAi<unknown>(k),
  tulisAi,
  bacaSinkron,
  tulisSinkron,
};
