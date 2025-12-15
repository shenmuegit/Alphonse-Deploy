import { ModuleConfig } from '../config/ConfigTypes';

export interface BuildHooks {
  beforeBuild?: (module: ModuleConfig) => Promise<void>;
  afterBuild?: (module: ModuleConfig, success: boolean) => Promise<void>;
}

export async function executeHook(
  hook: string | null | undefined,
  module: ModuleConfig,
  ...args: any[]
): Promise<void> {
  if (!hook) {
    return;
  }
  
  // 预留钩子执行逻辑
  // 可以执行用户定义的脚本或回调函数
  // 这里暂时留空，后续可以根据需要实现
}

