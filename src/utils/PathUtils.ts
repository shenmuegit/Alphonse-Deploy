import * as path from 'path';

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  return path.resolve(workspaceRoot, relativePath);
}

export function getRelativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath);
}

export function normalizePath(pathStr: string): string {
  return path.normalize(pathStr);
}

