import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { DetectedModule } from './ModuleTypes';
import { ModuleType } from '../config/ConfigTypes';
import { fileExists, directoryExists } from '../utils/FileUtils';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class ModuleDetector {
  constructor(private workspaceRoot: string) {}

  async detectModules(): Promise<DetectedModule[]> {
    const modules: DetectedModule[] = [];
    const folders = await this.getDirectories(this.workspaceRoot);
    
    for (const folder of folders) {
      const folderPath = path.join(this.workspaceRoot, folder);
      const moduleType = await this.detectModuleType(folderPath);
      
      if (moduleType) {
        modules.push({
          name: this.getModuleName(folderPath),
          path: folder,
          type: moduleType
        });
      }
    }
    
    return modules;
  }

  async detectModuleType(folderPath: string): Promise<ModuleType | null> {
    // 检查 npm/Vue 项目
    const packageJsonPath = path.join(folderPath, 'package.json');
    if (await fileExists(packageJsonPath)) {
      return 'npm';
    }
    
    // 检查 Maven 项目
    const pomXmlPath = path.join(folderPath, 'pom.xml');
    if (await fileExists(pomXmlPath)) {
      return 'maven';
    }
    
    // 检查 Python 项目
    const requirementsPath = path.join(folderPath, 'requirements.txt');
    const setupPyPath = path.join(folderPath, 'setup.py');
    if (await fileExists(requirementsPath) || await fileExists(setupPyPath)) {
      return 'python';
    }
    
    return null;
  }

  getModuleName(folderPath: string): string {
    return path.basename(folderPath);
  }

  private async getDirectories(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath);
      const directories: string[] = [];
      
      for (const entry of entries) {
        // 跳过隐藏文件夹和 node_modules 等
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'out') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry);
        if (await directoryExists(fullPath)) {
          directories.push(entry);
        }
      }
      
      return directories;
    } catch (error) {
      return [];
    }
  }
}

