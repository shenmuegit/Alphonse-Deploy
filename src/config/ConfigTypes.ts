export type ModuleType = "npm" | "maven" | "python";

export interface BuildConfig {
  command: string;
  directory: string;
  workingDirectory: string;
}

export interface CompressConfig {
  enabled: boolean;
  target: string;
  outputName: string;
}

export interface UploadConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
}

export interface ModuleDeployConfig {
  scriptName: string;
  scriptPath: string;
}

export interface HooksConfig {
  beforeBuild?: string | null;
  afterBuild?: string | null;
  beforeUpload?: string | null;
  afterUpload?: string | null;
  beforeDeploy?: string | null;
  afterDeploy?: string | null;
}

export interface ModuleConfig {
  id: string;
  name: string;
  type: ModuleType;
  path: string;
  build: BuildConfig;
  compress: CompressConfig;
  upload: UploadConfig;
  deploy: ModuleDeployConfig;
  hooks: HooksConfig;
}

export interface GlobalHooksConfig {
  beforeBuild?: string | null;
  afterBuild?: string | null;
  beforeUpload?: string | null;
  afterUpload?: string | null;
  beforeDeploy?: string | null;
  afterDeploy?: string | null;
}

export interface DeployConfig {
  modules: ModuleConfig[];
  globalHooks: GlobalHooksConfig;
}

