import { SimulationSnapshot } from '../core/WorldSimulation.js';

export interface SaveMetadata {
  saveVersion: number;
  gameVersion: string;
  savedAtTimestamp: number;
  checksum: string;
}

export interface SaveFileContent {
  metadata: SaveMetadata;
  snapshot: SimulationSnapshot;
}
