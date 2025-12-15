import { UploadConfig } from '../config/ConfigTypes';

export interface UploadHooks {
  beforeUpload?: (localPath: string, config: UploadConfig) => Promise<void>;
  afterUpload?: (localPath: string, config: UploadConfig, success: boolean) => Promise<void>;
}

export async function executeHook(
  hook: string | null | undefined,
  localPath: string,
  config: UploadConfig,
  ...args: any[]
): Promise<void> {
  if (!hook) {
    return;
  }
  
  // 预留钩子执行逻辑
}

