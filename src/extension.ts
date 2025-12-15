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
	// 首先初始化输出通道，确保即使后续出错也能记录日志
	try {
		outputChannel = vscode.window.createOutputChannel('Alphonse Deploy');
		logger = new Logger(outputChannel);
	} catch (err) {
		// 如果连输出通道都无法创建，使用控制台输出
		console.error('Failed to create output channel:', err);
	}

	try {
		// 显示输出通道（如果已创建）
		if (outputChannel) {
			outputChannel.show(true);
		}
		if (logger) {
			logger.info('Alphonse Deploy 插件开始激活...');
		}

		// 立即注册 TreeView，不依赖任何初始化，确保视图始终可用
		try {
			moduleTreeProvider = new ModuleTreeProvider(null);
			const treeView = vscode.window.createTreeView('moduleTreeView', {
				treeDataProvider: moduleTreeProvider,
				showCollapseAll: false,
				canSelectMany: false
			});
			context.subscriptions.push(treeView);
			if (logger) {
				logger.info('模块树视图已注册（初始状态）');
			}
		} catch (treeViewError: any) {
			const errorMsg = `TreeView 初始注册失败: ${treeViewError?.message || '未知错误'}`;
			if (logger) {
				logger.error(errorMsg);
			}
			console.error(errorMsg, treeViewError);
		}

		// 获取工作区根路径
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const globalStoragePath = context.globalStorageUri?.fsPath;

		if (!workspaceRoot) {
			logger.info('未检测到工作区，使用全局配置');
			if (!globalStoragePath) {
				logger.error('无法获取全局存储路径，插件可能无法正常工作');
				vscode.window.showWarningMessage('Alphonse Deploy: 无法获取全局存储路径，部分功能可能受限');
				// 不提前返回，继续注册命令，但使用临时配置管理器
			}
		} else {
			logger.info(`使用工作区配置: ${workspaceRoot}`);
		}

		// 初始化配置管理器（有工作区用项目配置，无工作区用全局配置）
		// 即使初始化失败，也要继续注册命令
		try {
			configManager = new ConfigManager(workspaceRoot, globalStoragePath);
		} catch (error: any) {
			logger.error(`配置管理器初始化失败: ${error?.message || '未知错误'}`);
			vscode.window.showWarningMessage('Alphonse Deploy: 配置管理器初始化失败，部分功能可能受限');
			// 不提前返回，继续注册命令
		}

		// 更新模块树视图的 provider（配置管理器初始化成功后）
		if (moduleTreeProvider) {
			try {
				// 更新 provider 的 configManager
				moduleTreeProvider.setConfigManager(configManager);
				if (logger) {
					logger.info('模块树视图已更新（配置管理器已初始化）');
					logger.info(`视图容器 ID: alphonseDeploy`);
					logger.info(`树视图 ID: moduleTreeView`);
				}
			} catch (error: any) {
				const errorMsg = `更新模块树视图失败: ${error?.message || '未知错误'}`;
				if (logger) {
					logger.error(errorMsg);
				}
				console.error(errorMsg, error);
			}
		}

		// 初始化配置 Webview（如果配置管理器可用）
		if (configManager) {
			try {
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
			} catch (error: any) {
				logger.error(`Webview 视图提供者初始化失败: ${error?.message || '未知错误'}`);
			}
		}

		// 注册命令（无论初始化是否成功，都要注册命令）
		// 这是最关键的：命令必须在激活函数中注册，不能因为任何错误而跳过
		try {
			context.subscriptions.push(
				vscode.commands.registerCommand('alphonse-deploy.detectModules', async () => {
					if (!configManager) {
						vscode.window.showErrorMessage('Alphonse Deploy: 配置管理器未初始化，请重新加载窗口');
						if (logger) {
							logger.error('检测模块命令被调用，但配置管理器未初始化');
						}
						return;
					}
					await detectModules();
				})
			);
			if (logger) {
				logger.info('命令已注册: alphonse-deploy.detectModules');
			}
		} catch (err: any) {
			const errorMsg = `注册命令 detectModules 失败: ${err?.message || '未知错误'}`;
			if (logger) {
				logger.error(errorMsg);
			}
			console.error(errorMsg, err);
		}


		try {
			context.subscriptions.push(
				vscode.commands.registerCommand('alphonse-deploy.editModule', async (item: ModuleTreeItem) => {
					if (!configManager || !configWebviewProvider) {
						vscode.window.showErrorMessage('Alphonse Deploy: 配置管理器未初始化，请重新加载窗口');
						return;
					}
					if (item.module) {
						if (logger) {
							logger.info(`编辑模块: ${item.module.name} (${item.module.id})`);
						}
						await configWebviewProvider.loadModule(item.module.id);
					} else {
						if (logger) {
							logger.warn('编辑模块命令被调用，但模块信息为空');
						}
						vscode.window.showWarningMessage('无法编辑：模块信息不可用');
					}
				})
			);
			if (logger) {
				logger.info('命令已注册: alphonse-deploy.editModule');
			}
		} catch (err: any) {
			const errorMsg = `注册命令 editModule 失败: ${err?.message || '未知错误'}`;
			if (logger) {
				logger.error(errorMsg);
			}
			console.error(errorMsg, err);
		}

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.deleteModule', async (item: ModuleTreeItem) => {
				if (!configManager || !moduleTreeProvider) {
					vscode.window.showErrorMessage('Alphonse Deploy: 配置管理器未初始化，请重新加载窗口');
					return;
				}
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
				if (!moduleTreeProvider) {
					vscode.window.showErrorMessage('Alphonse Deploy: 模块树提供者未初始化，请重新加载窗口');
					return;
				}
				moduleTreeProvider.refresh();
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('alphonse-deploy.showView', async () => {
				await vscode.commands.executeCommand('workbench.view.extension.alphonseDeploy');
				logger.info('已尝试显示部署管理视图');
			})
		);

		if (logger) {
			logger.info('Alphonse Deploy 插件已激活');
			logger.info('所有视图和命令已注册完成');
			logger.info(`已注册命令: alphonse-deploy.detectModules`);
			logger.info(`已注册命令: alphonse-deploy.editModule`);
			logger.info(`已注册命令: alphonse-deploy.deleteModule`);
			logger.info(`已注册命令: alphonse-deploy.buildModule`);
			logger.info(`已注册命令: alphonse-deploy.uploadModule`);
			logger.info(`已注册命令: alphonse-deploy.deployModule`);
			logger.info(`已注册命令: alphonse-deploy.buildAndDeploy`);
			logger.info(`已注册命令: alphonse-deploy.refreshModules`);
			logger.info(`已注册命令: alphonse-deploy.showView`);
		}

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

