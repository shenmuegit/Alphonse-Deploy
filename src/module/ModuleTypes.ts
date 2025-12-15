import { ModuleType } from '../config/ConfigTypes';

export interface DetectedModule {
  name: string;
  path: string;
  type: ModuleType;
}

