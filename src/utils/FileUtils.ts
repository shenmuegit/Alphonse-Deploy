import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const stat = promisify(fs.stat);

export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await access(dirPath, fs.constants.F_OK);
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Failed to read JSON file ${filePath}: ${error}`);
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  try {
    const content = JSON.stringify(data, null, 2);
    await ensureDirectory(path.dirname(filePath));
    await writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write JSON file ${filePath}: ${error}`);
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

