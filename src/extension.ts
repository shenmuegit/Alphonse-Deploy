import * as vscode from 'vscode';
import { ConfigManager } from './config/ConfigManager';
import { ModuleDetector } from './module/ModuleDetector';
import { ModuleTreeProvider, ModuleTreeItem } from './ui/ModuleTreeProvider';
import { ConfigWebviewProvider } from './ui/ConfigWebviewProvider';
import { BuildExecutor } from './build/BuildExecutor';
import { Compressor } from './compress/Compressor';
import { SCPUploader } from './upload/SCPUploader';
import { DeployExecutor } from './deploy/DeployExecutor';
import { Logger } from './utils/Logger';
import { ensureDirectory } from './utils/FileUtils';
import { resolveWorkspacePath } from './utils/PathUtils';
import * as path from 'path';

let configManager: ConfigManager;
let moduleTreeProvider: ModuleTreeProvider;
let configWebviewProvider: ConfigWebviewProvider;
let logger: Logger;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	try {
		// 获取工作区根路径
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const globalStoragePath = context.globalStorageUri?.fsPath;

		// 初始化输出通道和日志
		outputChannel = vscode.window.createOutputChannel('Alphonse Deploy');
		logger = new Logger(outputChannel);
		outputChannel.show(true);

		if (!workspaceRoot) {
			logger.info('未检测到工作区，使用全局配置');
			if (!globalStoragePath) {
				logger.error('无法获取全局存储路径，插件可能无法正常工作');
				vscode.window.showErrorMessage('Alphonse Deploy: 无法初始化配置管理器');
				return;
			}
		} else {
			logger.info(`使用工作区配置: ${workspaceRoot}`);
		}

		// 初始化配置管理器（有工作区用项目配置，无工作区用全局配置）
		configManager = new ConfigManager(workspaceRoot, globalStoragePath);

		// 初始化模块树视图
		moduleTreeProvider = new ModuleTreeProvider(configManager);
		const treeView = vscode.window.createTreeView('moduleTreeView', {
			treeDataProvider: moduleTreeProvider,
			showCollapseAll: false,
			canSelectMany: false
		});
		context.subscriptions.push(treeView);
		logger.info('模块树视图已注册');
		logger.info(`视图容器 ID: alphonseDeploy`);
		logger.info(`树视图 ID: moduleTreeView`);

		// 初始化配置 Webview
		configWebviewProvider = new ConfigWebviewProvider(context, configManager, logger);
		const webviewProviderRegistration = vscode.window.registerWebviewViewProvider(
			ConfigWebviewProvider.viewType,
			configWebviewProvider,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);
		context.subscriptions.push(webviewProviderRegistration);
		logger.info('Webview 视图提供者已注册');

		// 注册命令
		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.detectModules', async () => {
				await detectModules();
			})
		);


		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.editModule', async (item: ModuleTreeItem) => {
				if (item.module) {
					logger.info(`编辑模块: ${item.module.name} (${item.module.id})`);
					await configWebviewProvider.loadModule(item.module.id);
				} else {
					logger.warn('编辑模块命令被调用，但模块信息为空');
					vscode.window.showWarningMessage('无法编辑：模块信息不可用');
				}
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.deleteModule', async (item: ModuleTreeItem) => {
				if (item.module) {
					const confirm = await vscode.window.showWarningMessage(
						`确定要删除模块 ${item.module.name} 吗？`,
						'确定',
						'取消'
					);
					if (confirm === '确定') {
						try {
							await configManager.deleteModule(item.module.id);
							vscode.window.showInformationMessage(`模块 ${item.module.name} 已删除`);
							moduleTreeProvider.refresh();
						} catch (error: any) {
							vscode.window.showErrorMessage(`删除模块失败: ${error.message}`);
						}
					}
				}
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.buildModule', async (item: ModuleTreeItem) => {
				if (item.module) {
					await buildModule(item.module);
				}
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.uploadModule', async (item: ModuleTreeItem) => {
				if (item.module) {
					await uploadModule(item.module);
				}
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.deployModule', async (item: ModuleTreeItem) => {
				if (item.module) {
					await deployModule(item.module);
				}
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.buildAndDeploy', async (item: ModuleTreeItem) => {
				if (item.module) {
					await buildAndDeploy(item.module);
				}
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.refreshModules', () => {
				moduleTreeProvider.refresh();
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.showView', async () => {
				await vscode.commands.executeCommand('workbench.view.extension.alphonseDeploy');
				logger.info('已尝试显示部署管理视图');
			})
		);

		logger.info('Alphonse Deploy 插件已激活');
		logger.info('所有视图和命令已注册完成');

		// 尝试延迟显示视图（给 VSCode 时间完成初始化）
		setTimeout(async () => {
			try {
				await vscode.commands.executeCommand('workbench.view.extension.alphonseDeploy');
				logger.info('已尝试显示部署管理视图');
			} catch (err: any) {
				logger.warn(`无法自动显示视图: ${err?.message || '未知错误'}`);
			}
		}, 1000);
	} catch (error: any) {
		const errorMessage = error?.message || '未知错误';
		vscode.window.showErrorMessage(`Alphonse Deploy 插件激活失败: ${errorMessage}`);
		if (outputChannel) {
			outputChannel.appendLine(`[ERROR] 插件激活失败: ${errorMessage}`);
			if (error?.stack) {
				outputChannel.appendLine(`[ERROR] ${error.stack}`);
			}
			outputChannel.show(true);
		}
		console.error('Alphonse Deploy activation error:', error);
	}
}

export function deactivate() {
	if (outputChannel) {
		outputChannel.dispose();
	}
}

async function detectModules() {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceRoot) {
		vscode.window.showWarningMessage('请先打开一个工作区文件夹以检测模块');
		return;
	}

	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: '正在检测模块...',
				cancellable: false
			},
			async (progress) => {
				const detector = new ModuleDetector(workspaceRoot);
				const detectedModules = await detector.detectModules();

				if (detectedModules.length === 0) {
					vscode.window.showInformationMessage('未检测到任何模块');
					return;
				}

				// 显示检测结果，让用户选择添加
				const moduleNames = detectedModules.map(m => `${m.name} (${m.type})`);
				const selected = await vscode.window.showQuickPick(moduleNames, {
					canPickMany: true,
					placeHolder: '选择要添加的模块'
				});

				if (selected && selected.length > 0) {
					const existingModules = await configManager.getModules();
					const existingPaths = new Set(existingModules.map(m => m.path));

					// 只处理第一个选中的模块，自动打开配置面板
					const firstSelection = selected[0];
					const moduleInfo = detectedModules.find(m => `${m.name} (${m.type})` === firstSelection);

					if (moduleInfo) {
						if (existingPaths.has(moduleInfo.path)) {
							// 如果模块已存在，直接打开编辑
							const existingModule = existingModules.find(m => m.path === moduleInfo.path);
							if (existingModule) {
								await configWebviewProvider.loadModule(existingModule.id);
								vscode.window.showInformationMessage(`模块 ${moduleInfo.name} 已存在，已打开配置`);
							}
						} else {
							// 如果模块不存在，创建默认配置并打开配置面板
							const moduleConfig = createDefaultModuleConfig(moduleInfo, workspaceRoot);
							// 先不保存，直接打开配置面板让用户确认
							await configWebviewProvider.showNewModule(moduleConfig);
							vscode.window.showInformationMessage(`已为模块 ${moduleInfo.name} 创建默认配置，请检查并保存`);
						}
					}

					// 处理其他选中的模块（如果有）
					for (let i = 1; i < selected.length; i++) {
						const selection = selected[i];
						const moduleInfo = detectedModules.find(m => `${m.name} (${m.type})` === selection);
						if (moduleInfo && !existingPaths.has(moduleInfo.path)) {
							const moduleConfig = createDefaultModuleConfig(moduleInfo, workspaceRoot);
							await configManager.addModule(moduleConfig);
						}
					}

					moduleTreeProvider.refresh();
				}
			}
		);
	} catch (error: any) {
		vscode.window.showErrorMessage(`检测模块失败: ${error.message}`);
		logger.error('检测模块失败', error);
	}
}

function createDefaultModuleConfig(detectedModule: any, workspaceRoot: string): any {
	const id = `module-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

	let buildCommand = '';
	let buildDirectory = '';

	switch (detectedModule.type) {
		case 'npm':
			buildCommand = 'npm run build';
			buildDirectory = './dist';
			break;
		case 'maven':
			buildCommand = 'mvn clean package';
			buildDirectory = './target';
			break;
		case 'python':
			buildCommand = 'python setup.py build';
			buildDirectory = './dist';
			break;
	}

	return {
		id,
		name: detectedModule.name,
		type: detectedModule.type,
		path: detectedModule.path,
		build: {
			command: buildCommand,
			directory: buildDirectory,
			workingDirectory: detectedModule.path
		},
		compress: {
			enabled: true,
			target: buildDirectory,
			outputName: `${detectedModule.name}.zip`
		},
		upload: {
			host: '',
			port: 22,
			username: '',
			password: '',
			remotePath: `/var/www/${detectedModule.name}`
		},
		deploy: {
			scriptName: `${detectedModule.name}.sh`,
			scriptPath: `.deploy/scripts/${detectedModule.name}.sh`
		},
		hooks: {}
	};
}

async function buildModule(module: any) {
	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `正在构建模块: ${module.name}`,
				cancellable: false
			},
			async () => {
				const executor = new BuildExecutor(logger);
				await executor.execute(module);
				vscode.window.showInformationMessage(`模块 ${module.name} 构建完成`);
			}
		);
	} catch (error: any) {
		vscode.window.showErrorMessage(`构建失败: ${error.message}`);
		logger.error('构建失败', error);
	}
}

async function uploadModule(module: any) {
	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `正在上传模块: ${module.name}`,
				cancellable: false
			},
			async () => {
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					throw new Error('No workspace folder found');
				}

				// 先压缩
				const compressor = new Compressor(logger);
				const outputDir = path.join(workspaceRoot, '.deploy', 'output');
				await ensureDirectory(outputDir);

				const zipPath = await compressor.compress(
					module.compress,
					module.name,
					outputDir,
					module.build.workingDirectory
				);

				// 上传
				const uploader = new SCPUploader(logger);
				await uploader.upload(zipPath, module.upload);

				vscode.window.showInformationMessage(`模块 ${module.name} 上传完成`);
			}
		);
	} catch (error: any) {
		vscode.window.showErrorMessage(`上传失败: ${error.message}`);
		logger.error('上传失败', error);
	}
}

async function deployModule(module: any) {
	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `正在部署模块: ${module.name}`,
				cancellable: false
			},
			async () => {
				const executor = new DeployExecutor(logger);
				await executor.execute(module.deploy.scriptPath, module.upload);
				vscode.window.showInformationMessage(`模块 ${module.name} 部署完成`);
			}
		);
	} catch (error: any) {
		vscode.window.showErrorMessage(`部署失败: ${error.message}`);
		logger.error('部署失败', error);
	}
}

async function buildAndDeploy(module: any) {
	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `正在执行部署: ${module.name}`,
				cancellable: false
			},
			async (progress) => {
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					throw new Error('No workspace folder found');
				}

				// 步骤 1: 打包（构建）
				progress.report({ increment: 0, message: '正在打包...' });
				logger.info(`[1/4] 开始打包模块: ${module.name}`);
				logger.info(`[1/4] 构建命令: ${module.build.command}`);
				logger.info(`[1/4] 工作目录: ${module.build.workingDirectory}`);
				const buildExecutor = new BuildExecutor(logger);
				try {
					await buildExecutor.execute(module);
					logger.info(`[1/4] 打包完成`);
				} catch (error: any) {
					logger.error(`[1/4] 打包失败`, error);
					throw new Error(`构建失败: ${error.message}`);
				}

				// 步骤 2: 压缩
				progress.report({ increment: 25, message: '正在压缩...' });
				logger.info(`[2/4] 开始压缩构建结果`);
				const compressor = new Compressor(logger);
				const outputDir = path.join(workspaceRoot, '.deploy', 'output');
				await ensureDirectory(outputDir);

				const zipPath = await compressor.compress(
					module.compress,
					module.name,
					outputDir,
					module.build.workingDirectory
				);
				logger.info(`[2/4] 压缩完成: ${zipPath}`);

				// 步骤 3: 上传
				progress.report({ increment: 50, message: '正在上传...' });
				logger.info(`[3/4] 开始上传到服务器: ${module.upload.host}:${module.upload.port}`);
				const uploader = new SCPUploader(logger);
				await uploader.upload(zipPath, module.upload);
				logger.info(`[3/4] 上传完成`);

				// 步骤 4: 执行脚本
				progress.report({ increment: 75, message: '正在执行部署脚本...' });
				logger.info(`[4/4] 开始执行部署脚本`);
				const deployExecutor = new DeployExecutor(logger);
				await deployExecutor.execute(module.deploy.scriptPath, module.upload);
				logger.info(`[4/4] 部署脚本执行完成`);

				progress.report({ increment: 100, message: '部署完成' });
				vscode.window.showInformationMessage(`模块 ${module.name} 部署完成`);
			}
		);
	} catch (error: any) {
		vscode.window.showErrorMessage(`部署失败: ${error.message}`);
		logger.error('部署失败', error);
	}
}

