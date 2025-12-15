import * as vscode from 'vscode';
import * as path from 'path';
import { NodeSSH } from 'node-ssh';
import { UploadConfig } from '../config/ConfigTypes';
import { DeployHooks, executeHook } from './DeployHooks';
import { Logger } from '../utils/Logger';
import { resolveWorkspacePath } from '../utils/PathUtils';
import { fileExists } from '../utils/FileUtils';

export class DeployExecutor {
	private ssh: NodeSSH;

	constructor(private logger: Logger) {
		this.ssh = new NodeSSH();
	}

	async execute(
		scriptPath: string,
		config: UploadConfig,
		hooks?: DeployHooks
	): Promise<void> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			throw new Error('No workspace folder found');
		}

		const fullScriptPath = resolveWorkspacePath(workspaceRoot, scriptPath);

		// 验证脚本文件是否存在
		if (!(await fileExists(fullScriptPath))) {
			throw new Error(`部署脚本不存在: ${scriptPath}`);
		}

		// 执行 beforeDeploy 钩子
		if (hooks?.beforeDeploy) {
			await hooks.beforeDeploy(scriptPath, config);
		}

		this.logger.info(`开始部署: ${scriptPath}`);
		this.logger.info(`服务器: ${config.host}:${config.port}`);

		let success = false;

		try {
			// 连接服务器
			await this.ssh.connect({
				host: config.host,
				port: config.port,
				username: config.username,
				password: config.password
			});

			this.logger.info('SSH 连接成功');

			// 上传部署脚本
			const scriptName = path.basename(fullScriptPath);
			const remoteScriptPath = `${config.remotePath}/${scriptName}`;

			await this.ssh.putFile(fullScriptPath, remoteScriptPath);
			this.logger.info(`脚本已上传: ${remoteScriptPath}`);

			// 赋予执行权限
			await this.ssh.execCommand(`chmod +x ${remoteScriptPath}`);
			this.logger.info('已赋予脚本执行权限');

			// 切换到 root 并执行脚本
			// 使用 sudo -S 从标准输入读取密码
			// 注意：sudo -i 会启动交互式 shell，在非交互式环境中无法工作
			// 因此使用 sudo -S 配合 printf 来安全传递密码

			// 使用 printf 而不是 echo 来避免密码中的特殊字符问题
			// %s 格式会正确处理所有字符，包括单引号、双引号、$等
			const escapedPassword = config.password.replace(/'/g, "'\\''");
			const deployCommand = `printf '%s\\n' '${escapedPassword}' | sudo -S bash ${remoteScriptPath}`;

			this.logger.info('开始执行部署脚本（使用 sudo -S）');
			const result = await this.ssh.execCommand(deployCommand, {
				onStdout: (chunk: Buffer) => {
					this.logger.info(chunk.toString());
				},
				onStderr: (chunk: Buffer) => {
					const output = chunk.toString();
					// 过滤掉密码相关的警告信息，但保留其他错误
					if (!output.toLowerCase().includes('password') &&
						!output.includes('askpass') &&
						!output.trim().startsWith('sudo:')) {
						this.logger.warn(output);
					}
				}
			});

			if (result.code === 0) {
				success = true;
				this.logger.info('部署成功');
			} else {
				throw new Error(`部署脚本执行失败，退出码: ${result.code}`);
			}
		} catch (error: any) {
			success = false;
			this.logger.error('部署失败', error);
			throw error;
		} finally {
			this.ssh.dispose();

			// 执行 afterDeploy 钩子
			if (hooks?.afterDeploy) {
				await hooks.afterDeploy(scriptPath, config, success);
			}
		}
	}
}

