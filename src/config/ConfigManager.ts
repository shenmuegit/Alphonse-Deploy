import * as path from 'path';
import * as vscode from 'vscode';
import { DeployConfig, ModuleConfig, GlobalHooksConfig } from './ConfigTypes';
import { readJsonFile, writeJsonFile, ensureDirectory, fileExists } from '../utils/FileUtils';

export class ConfigManager {
	private configPath: string;
	private configDir: string;
	private isWorkspaceConfig: boolean;

	constructor(workspaceRoot: string | undefined, globalStoragePath?: string) {
		if (workspaceRoot) {
			// 使用项目根目录配置
			this.configDir = path.join(workspaceRoot, '.deploy');
			this.configPath = path.join(this.configDir, 'config.json');
			this.isWorkspaceConfig = true;
		} else if (globalStoragePath) {
			// 使用全局配置
			this.configDir = path.join(globalStoragePath, 'alphonse-deploy');
			this.configPath = path.join(this.configDir, 'config.json');
			this.isWorkspaceConfig = false;
		} else {
			throw new Error('Either workspaceRoot or globalStoragePath must be provided');
		}
	}

	getConfigPath(): string {
		return this.configPath;
	}

	isWorkspaceConfiguration(): boolean {
		return this.isWorkspaceConfig;
	}

	getConfigDirectory(): string {
		return this.configDir;
	}

	async ensureConfigDirectory(): Promise<void> {
		await ensureDirectory(this.configDir);
	}

	async loadConfig(): Promise<DeployConfig> {
		await this.ensureConfigDirectory();

		if (await fileExists(this.configPath)) {
			try {
				return await readJsonFile<DeployConfig>(this.configPath);
			} catch (error) {
				throw new Error(`Failed to load config: ${error}`);
			}
		} else {
			const defaultConfig: DeployConfig = {
				modules: [],
				globalHooks: {}
			};
			await this.saveConfig(defaultConfig);
			return defaultConfig;
		}
	}

	async saveConfig(config: DeployConfig): Promise<void> {
		await this.ensureConfigDirectory();

		if (!this.validateConfig(config)) {
			throw new Error('Invalid configuration');
		}

		await writeJsonFile(this.configPath, config);
	}

	async getModules(): Promise<ModuleConfig[]> {
		const config = await this.loadConfig();
		return config.modules;
	}

	async getModuleById(id: string): Promise<ModuleConfig | undefined> {
		const modules = await this.getModules();
		return modules.find(m => m.id === id);
	}

	async addModule(module: ModuleConfig): Promise<void> {
		const config = await this.loadConfig();
		config.modules.push(module);
		await this.saveConfig(config);
	}

	async updateModule(id: string, moduleUpdate: Partial<ModuleConfig>): Promise<void> {
		const config = await this.loadConfig();
		const index = config.modules.findIndex(m => m.id === id);

		if (index === -1) {
			throw new Error(`Module with id ${id} not found`);
		}

		config.modules[index] = { ...config.modules[index], ...moduleUpdate };
		await this.saveConfig(config);
	}

	async deleteModule(id: string): Promise<void> {
		const config = await this.loadConfig();
		config.modules = config.modules.filter(m => m.id !== id);
		await this.saveConfig(config);
	}

	validateConfig(config: DeployConfig): boolean {
		if (!Array.isArray(config.modules)) {
			return false;
		}

		for (const module of config.modules) {
			if (!module.id || !module.name || !module.type || !module.path) {
				return false;
			}
			if (!module.build || !module.compress || !module.upload || !module.deploy) {
				return false;
			}
		}

		return true;
	}
}

