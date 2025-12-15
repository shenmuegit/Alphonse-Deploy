import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { CompressConfig } from '../config/ConfigTypes';
import { Logger } from '../utils/Logger';
import { resolveWorkspacePath } from '../utils/PathUtils';
import { fileExists, directoryExists, ensureDirectory } from '../utils/FileUtils';

export class Compressor {
	constructor(private logger: Logger) { }

	async compress(
		config: CompressConfig,
		moduleName: string,
		outputDir: string,
		moduleWorkingDir?: string
	): Promise<string> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			throw new Error('No workspace folder found');
		}

		await ensureDirectory(outputDir);

		// 如果提供了模块工作目录，相对于模块工作目录解析压缩目标
		// 否则相对于工作区根目录解析
		let targetPath: string;
		if (moduleWorkingDir) {
			const moduleDir = resolveWorkspacePath(workspaceRoot, moduleWorkingDir);
			targetPath = path.resolve(moduleDir, config.target);
		} else {
			targetPath = resolveWorkspacePath(workspaceRoot, config.target);
		}

		const outputName = config.outputName || `${moduleName}.zip`;
		const outputPath = path.join(outputDir, outputName);

		// 验证压缩目标是否存在
		const targetExists = await fileExists(targetPath) || await directoryExists(targetPath);
		if (!targetExists) {
			this.logger.error(`压缩目标路径: ${targetPath}`);
			this.logger.error(`模块工作目录: ${moduleWorkingDir || '未指定'}`);
			throw new Error(`压缩目标不存在: ${config.target} (解析路径: ${targetPath})`);
		}

		this.logger.info(`开始压缩: ${config.target} -> ${outputPath}`);

		return new Promise<string>((resolve, reject) => {
			const output = fs.createWriteStream(outputPath);
			const archive = archiver('zip', {
				zlib: { level: 9 }
			});

			output.on('close', () => {
				const size = archive.pointer();
				this.logger.info(`压缩完成: ${outputPath} (${size} 字节)`);
				resolve(outputPath);
			});

			archive.on('error', (err: Error) => {
				this.logger.error('压缩失败', err);
				reject(err);
			});

			archive.pipe(output);

			const stats = fs.statSync(targetPath);
			if (stats.isDirectory()) {
				archive.directory(targetPath, false);
			} else {
				archive.file(targetPath, { name: path.basename(targetPath) });
			}

			archive.finalize();
		});
	}

	async validateCompressTarget(target: string): Promise<boolean> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			return false;
		}

		const targetPath = resolveWorkspacePath(workspaceRoot, target);
		return await fileExists(targetPath) || await directoryExists(targetPath);
	}
}

