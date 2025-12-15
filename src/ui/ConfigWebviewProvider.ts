import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { ModuleConfig, UploadConfig } from '../config/ConfigTypes';
import { getWebviewContent } from './WebviewContent';
import { SCPUploader } from '../upload/SCPUploader';
import { Logger } from '../utils/Logger';

export class ConfigWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'configWebview';
	private _view?: vscode.WebviewView;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private configManager: ConfigManager,
		private logger: Logger
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this.logger.info('Webview 视图正在被解析');
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri]
		};

		// 设置初始 HTML 内容
		webviewView.webview.html = getWebviewContent(
			webviewView.webview,
			this.context.extensionUri
		);

		// 监听视图可见性变化
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.logger.info('Webview 视图已变为可见');
			}
		});

		webviewView.webview.onDidReceiveMessage(async (message) => {
			this.logger.info(`收到 Webview 消息: ${message.command}`);
			switch (message.command) {
				case 'saveModule':
					await this.handleSaveModule(message.data);
					break;
				case 'testConnection':
					await this.handleTestConnection(message.data);
					break;
				case 'cancel':
					if (this._view) {
						this._view.show(false);
					}
					break;
			}
		});

		this.logger.info('Webview 视图解析完成');
	}

	public async loadModule(moduleId: string) {
		this.logger.info(`开始加载模块: ${moduleId}`);

		// 如果视图还没有被解析，先显示视图容器和配置视图
		if (!this._view) {
			this.logger.info('Webview 视图尚未初始化，尝试显示视图');
			// 先显示视图容器
			await vscode.commands.executeCommand('workbench.view.extension.alphonseDeploy');
			// 等待一下让视图容器显示
			await new Promise(resolve => setTimeout(resolve, 100));
			// 尝试通过命令显示配置视图（如果视图ID正确）
			// 注意：VSCode 会自动调用 resolveWebviewView 当视图首次显示时
		}

		// 如果仍然没有视图，尝试等待更长时间或提示用户
		let retries = 0;
		while (!this._view && retries < 10) {
			await new Promise(resolve => setTimeout(resolve, 100));
			retries++;
		}

		if (!this._view) {
			this.logger.error('Webview 视图仍未初始化，可能需要用户手动打开配置视图');
			const action = await vscode.window.showWarningMessage(
				'配置视图尚未初始化，请先点击侧边栏中的"模块配置"视图，然后重试',
				'打开配置视图'
			);
			if (action === '打开配置视图') {
				await vscode.commands.executeCommand('workbench.view.extension.alphonseDeploy');
			}
			return;
		}

		const module = await this.configManager.getModuleById(moduleId);
		if (module) {
			this._view.webview.html = getWebviewContent(
				this._view.webview,
				this.context.extensionUri,
				module
			);
			this._view.show(true);
			this.logger.info(`已加载模块配置: ${module.name}`);
		} else {
			vscode.window.showErrorMessage(`未找到模块: ${moduleId}`);
			this.logger.error(`未找到模块: ${moduleId}`);
		}
	}

	public async showNewModule(moduleData?: any) {
		this.logger.info('开始显示新建模块面板');

		// 如果视图还没有被解析，先显示视图容器
		if (!this._view) {
			this.logger.info('Webview 视图尚未初始化，尝试显示视图');
			await vscode.commands.executeCommand('workbench.view.extension.alphonseDeploy');
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		// 等待视图被解析
		let retries = 0;
		while (!this._view && retries < 10) {
			await new Promise(resolve => setTimeout(resolve, 100));
			retries++;
		}

		if (!this._view) {
			this.logger.error('Webview 视图仍未初始化');
			const action = await vscode.window.showWarningMessage(
				'配置视图尚未初始化，请先点击侧边栏中的"模块配置"视图，然后重试',
				'打开配置视图'
			);
			if (action === '打开配置视图') {
				await vscode.commands.executeCommand('workbench.view.extension.alphonseDeploy');
			}
			return;
		}

		// 如果提供了模块数据，使用它填充表单
		this._view.webview.html = getWebviewContent(
			this._view.webview,
			this.context.extensionUri,
			moduleData
		);
		this._view.show(true);
		if (moduleData) {
			this.logger.info(`已打开模块配置面板: ${moduleData.name}`);
		} else {
			this.logger.info('已打开新建模块配置面板');
		}
	}

	private async handleSaveModule(moduleData: ModuleConfig) {
		try {
			const existingModule = await this.configManager.getModuleById(moduleData.id);

			if (existingModule) {
				await this.configManager.updateModule(moduleData.id, moduleData);
				vscode.window.showInformationMessage(`模块 ${moduleData.name} 已更新`);
			} else {
				await this.configManager.addModule(moduleData);
				vscode.window.showInformationMessage(`模块 ${moduleData.name} 已添加`);
			}

			// 通知树视图刷新
			vscode.commands.executeCommand('alphonse-deploy.refreshModules');

			if (this._view) {
				this._view.show(false);
			}
		} catch (error: any) {
			vscode.window.showErrorMessage(`保存模块失败: ${error.message}`);
		}
	}

	private async handleTestConnection(uploadConfig: UploadConfig) {
		try {
			this.logger.info('开始测试服务器连接...');
			const uploader = new SCPUploader(this.logger);
			const success = await uploader.testConnection(uploadConfig);

			if (this._view) {
				this._view.webview.postMessage({
					command: 'testConnectionResult',
					success: success,
					error: success ? null : '连接失败，请检查服务器信息'
				});
			}

			// 同时显示 VSCode 通知
			if (success) {
				vscode.window.showInformationMessage(`服务器连接成功: ${uploadConfig.host}:${uploadConfig.port}`);
			} else {
				vscode.window.showErrorMessage(`服务器连接失败: ${uploadConfig.host}:${uploadConfig.port}`);
			}
		} catch (error: any) {
			this.logger.error('测试连接时出错', error);
			if (this._view) {
				this._view.webview.postMessage({
					command: 'testConnectionResult',
					success: false,
					error: error.message || '连接失败'
				});
			}
			vscode.window.showErrorMessage(`连接测试失败: ${error.message || '未知错误'}`);
		}
	}
}

