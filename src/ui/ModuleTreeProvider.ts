import * as vscode from 'vscode';
import { ModuleConfig } from '../config/ConfigTypes';
import { ConfigManager } from '../config/ConfigManager';

export class ModuleTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly module?: ModuleConfig
	) {
		super(label, collapsibleState);

		if (module) {
			this.contextValue = 'module';
			this.tooltip = `${module.name} (${module.type})`;
			this.description = module.path;
			this.iconPath = new vscode.ThemeIcon('package');
		} else {
			// 空状态提示项
			this.tooltip = '使用上方按钮添加或检测模块';
			this.iconPath = new vscode.ThemeIcon('info');
		}
	}
}

export class ModuleTreeProvider implements vscode.TreeDataProvider<ModuleTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ModuleTreeItem | undefined | null | void> = new vscode.EventEmitter<ModuleTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ModuleTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor(private configManager: ConfigManager) { }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ModuleTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: ModuleTreeItem): Promise<ModuleTreeItem[]> {
		if (!element) {
			// 根节点，返回所有模块
			try {
				const modules = await this.configManager.getModules();
				if (modules.length === 0) {
					// 如果没有模块，显示提示信息
					const isWorkspace = this.configManager.isWorkspaceConfiguration();
					const message = isWorkspace 
						? '点击上方按钮检测或添加模块'
						: '未打开工作区，请先打开工作区文件夹或手动添加模块';
					return [new ModuleTreeItem(
						message,
						vscode.TreeItemCollapsibleState.None
					)];
				}
				return modules.map(module => new ModuleTreeItem(
					module.name,
					vscode.TreeItemCollapsibleState.None,
					module
				));
			} catch (error) {
				return [new ModuleTreeItem(
					'加载配置失败',
					vscode.TreeItemCollapsibleState.None
				)];
			}
		}

		return [];
	}
}

