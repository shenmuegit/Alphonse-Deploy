import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { ModuleConfig } from '../config/ConfigTypes';
import { BuildHooks, executeHook } from './BuildHooks';
import { Logger } from '../utils/Logger';
import { resolveWorkspacePath } from '../utils/PathUtils';
import { cleanDirectory, directoryExists } from '../utils/FileUtils';

const execAsync = promisify(exec);

export class BuildExecutor {
	constructor(private logger: Logger) { }

	async execute(module: ModuleConfig, hooks?: BuildHooks): Promise<void> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			throw new Error('No workspace folder found');
		}

		// 执行 beforeBuild 钩子
		if (hooks?.beforeBuild) {
			await hooks.beforeBuild(module);
		}

		// 构建前清理构建输出目录
		// 构建输出目录应该相对于模块的工作目录解析
		if (module.build.directory) {
			try {
				const workingDir = resolveWorkspacePath(workspaceRoot, module.build.workingDirectory);
				// 相对于模块工作目录解析构建输出目录
				const buildOutputDir = path.resolve(workingDir, module.build.directory);
				const exists = await directoryExists(buildOutputDir);
				if (exists) {
					this.logger.info(`清理构建输出目录: ${buildOutputDir}`);
					this.logger.info(`模块工作目录: ${workingDir}`);
					this.logger.info(`构建输出目录（相对路径）: ${module.build.directory}`);
					await cleanDirectory(buildOutputDir);
					this.logger.info(`构建输出目录已清理`);
				} else {
					this.logger.info(`构建输出目录不存在，跳过清理: ${buildOutputDir}`);
				}
			} catch (error: any) {
				this.logger.warn(`清理构建输出目录失败，继续构建: ${error.message}`);
				// 清理失败不影响构建，只记录警告
			}
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

