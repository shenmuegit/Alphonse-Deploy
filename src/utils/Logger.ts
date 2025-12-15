import * as vscode from 'vscode';

export class Logger {
  constructor(private outputChannel: vscode.OutputChannel) {}

  info(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] [INFO] ${message}`);
  }

  error(message: string, error?: Error): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${message}`);
    if (error) {
      this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${error.message}`);
      if (error.stack) {
        this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${error.stack}`);
      }
    }
  }

  warn(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] [WARN] ${message}`);
  }

  clear(): void {
    this.outputChannel.clear();
  }
}

