import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ModuleConfig } from '../config/ConfigTypes';
import { BuildHooks, executeHook } from './BuildHooks';
import { Logger } from '../utils/Logger';
import { resolveWorkspacePath } from '../utils/PathUtils';

const execAsync = promisify(exec);

export class BuildExecutor {
  constructor(private logger: Logger) {}

  async execute(module: ModuleConfig, hooks?: BuildHooks): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder found');
    }

    // 执行 beforeBuild 钩子
    if (hooks?.beforeBuild) {
      await hooks.beforeBuild(module);
    }

    this.logger.info(`开始构建模块: ${module.name}`);
    this.logger.info(`构建命令: ${module.build.command}`);
    this.logger.info(`工作目录: ${module.build.workingDirectory}`);

    const workingDir = resolveWorkspacePath(workspaceRoot, module.build.workingDirectory);
    let success = false;

    try {
      const { stdout, stderr } = await execAsync(module.build.command, {
        cwd: workingDir,
        maxBuffer: 10 * 1024 * 1024
      });

      if (stdout) {
        this.logger.info(stdout);
      }
      if (stderr) {
        this.logger.warn(stderr);
      }

      success = true;
      this.logger.info(`模块 ${module.name} 构建成功`);
    } catch (error: any) {
      success = false;
      this.logger.error(`模块 ${module.name} 构建失败`, error);
      if (error.stdout) {
        this.logger.error(error.stdout);
      }
      if (error.stderr) {
        this.logger.error(error.stderr);
      }
      throw error;
    } finally {
      // 执行 afterBuild 钩子
      if (hooks?.afterBuild) {
        await hooks.afterBuild(module, success);
      }
    }
  }

  validateBuildCommand(command: string): boolean {
    return command.trim().length > 0;
  }
}

