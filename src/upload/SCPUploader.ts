import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NodeSSH } from 'node-ssh';
import { UploadConfig } from '../config/ConfigTypes';
import { UploadHooks, executeHook } from './UploadHooks';
import { Logger } from '../utils/Logger';

export class SCPUploader {
  private ssh: NodeSSH;

  constructor(private logger: Logger) {
    this.ssh = new NodeSSH();
  }

  async upload(
    localPath: string,
    config: UploadConfig,
    hooks?: UploadHooks
  ): Promise<void> {
    // 执行 beforeUpload 钩子
    if (hooks?.beforeUpload) {
      await hooks.beforeUpload(localPath, config);
    }

    this.logger.info(`开始上传到服务器: ${config.host}:${config.port}`);
    this.logger.info(`本地路径: ${localPath}`);
    this.logger.info(`远程路径: ${config.remotePath}`);

    let success = false;

    try {
      // 连接服务器
      await this.ssh.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password
      });

      this.logger.info('SSH 连接成功');

      // 确保远程目录存在
      await this.ssh.execCommand(`mkdir -p ${config.remotePath}`, {
        cwd: '/'
      });

      // 上传文件或目录
      const stats = fs.statSync(localPath);
      if (stats.isDirectory()) {
        await this.ssh.putDirectory(localPath, config.remotePath, {
          recursive: true,
          concurrency: 5,
          tick: (localPath, remotePath, error) => {
            if (error) {
              this.logger.warn(`上传文件失败: ${localPath} -> ${remotePath}`);
            } else {
              this.logger.info(`上传文件: ${localPath} -> ${remotePath}`);
            }
          }
        });
      } else {
        const remoteFilePath = `${config.remotePath}/${path.basename(localPath)}`;
        await this.ssh.putFile(localPath, remoteFilePath);
        this.logger.info(`上传文件: ${localPath} -> ${remoteFilePath}`);
      }

      success = true;
      this.logger.info('上传完成');
    } catch (error: any) {
      success = false;
      this.logger.error('上传失败', error);
      throw error;
    } finally {
      this.ssh.dispose();
      
      // 执行 afterUpload 钩子
      if (hooks?.afterUpload) {
        await hooks.afterUpload(localPath, config, success);
      }
    }
  }

  async testConnection(config: UploadConfig): Promise<boolean> {
    try {
      await this.ssh.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password
      });
      
      this.ssh.dispose();
      return true;
    } catch (error) {
      this.ssh.dispose();
      return false;
    }
  }
}

