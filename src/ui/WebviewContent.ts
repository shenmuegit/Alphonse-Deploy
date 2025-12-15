import * as vscode from 'vscode';
import { ModuleConfig, ModuleType } from '../config/ConfigTypes';

export function getWebviewContent(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	module?: ModuleConfig
): string {
	const moduleData = module ? JSON.stringify(module) : 'null';

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>模块配置</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, select, textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            box-sizing: border-box;
        }
        button {
            padding: 8px 16px;
            margin-right: 10px;
            margin-top: 10px;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .section {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <h2>${module ? '编辑模块' : '添加模块'}</h2>
    
    <div class="form-group">
        <label for="moduleName">模块名称 *</label>
        <input type="text" id="moduleName" required value="${module?.name || ''}">
    </div>
    
    <div class="form-group">
        <label for="moduleType">模块类型 *</label>
        <select id="moduleType" required>
            <option value="npm" ${module?.type === 'npm' ? 'selected' : ''}>npm/Vue</option>
            <option value="maven" ${module?.type === 'maven' ? 'selected' : ''}>Maven</option>
            <option value="python" ${module?.type === 'python' ? 'selected' : ''}>Python</option>
        </select>
    </div>
    
    <div class="form-group">
        <label for="modulePath">模块路径 *</label>
        <input type="text" id="modulePath" required value="${module?.path || ''}" placeholder="相对工作区的路径">
    </div>
    
    <div class="section">
        <div class="section-title">构建配置</div>
        <div class="form-group">
            <label for="buildCommand">构建命令 *</label>
            <input type="text" id="buildCommand" required value="${module?.build?.command || ''}" placeholder="例如: npm run build">
        </div>
        <div class="form-group">
            <label for="buildDirectory">构建输出目录 *</label>
            <input type="text" id="buildDirectory" required value="${module?.build?.directory || ''}" placeholder="例如: ./dist">
        </div>
        <div class="form-group">
            <label for="workingDirectory">工作目录 *</label>
            <input type="text" id="workingDirectory" required value="${module?.build?.workingDirectory || '.'}" placeholder="执行构建命令的目录">
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">压缩配置</div>
        <div class="form-group">
            <label for="compressTarget">压缩目标 *</label>
            <input type="text" id="compressTarget" required value="${module?.compress?.target || ''}" placeholder="要压缩的目录或文件路径">
        </div>
        <div class="form-group">
            <label for="compressOutputName">压缩文件名</label>
            <input type="text" id="compressOutputName" value="${module?.compress?.outputName || ''}" placeholder="例如: module.zip">
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">上传配置</div>
        <div class="form-group">
            <label for="uploadHost">服务器地址 *</label>
            <input type="text" id="uploadHost" required value="${module?.upload?.host || ''}" placeholder="例如: 192.168.1.100">
        </div>
        <div class="form-group">
            <label for="uploadPort">端口 *</label>
            <input type="number" id="uploadPort" required value="${module?.upload?.port || 22}">
        </div>
        <div class="form-group">
            <label for="uploadUsername">用户名 *</label>
            <input type="text" id="uploadUsername" required value="${module?.upload?.username || ''}">
        </div>
        <div class="form-group">
            <label for="uploadPassword">密码 *</label>
            <input type="password" id="uploadPassword" required value="${module?.upload?.password || ''}">
        </div>
        <div class="form-group">
            <label for="uploadRemotePath">远程路径 *</label>
            <input type="text" id="uploadRemotePath" required value="${module?.upload?.remotePath || ''}" placeholder="例如: /var/www/module">
        </div>
        <button type="button" id="testConnection" class="secondary">测试连接</button>
    </div>
    
    <div class="section">
        <div class="section-title">部署配置</div>
        <div class="form-group">
            <label for="deployScriptName">部署脚本名称</label>
            <input type="text" id="deployScriptName" value="${module?.deploy?.scriptName || ''}" placeholder="例如: deploy.sh">
        </div>
        <div class="form-group">
            <label for="deployScriptPath">部署脚本路径</label>
            <input type="text" id="deployScriptPath" value="${module?.deploy?.scriptPath || ''}" placeholder="例如: .deploy/scripts/deploy.sh">
        </div>
    </div>
    
    <div style="margin-top: 20px;">
        <button type="button" id="saveBtn">保存</button>
        <button type="button" id="cancelBtn" class="secondary">取消</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const moduleData = ${moduleData};
        
        document.getElementById('saveBtn').addEventListener('click', () => {
            const config = {
                id: moduleData?.id || generateId(),
                name: document.getElementById('moduleName').value,
                type: document.getElementById('moduleType').value,
                path: document.getElementById('modulePath').value,
                build: {
                    command: document.getElementById('buildCommand').value,
                    directory: document.getElementById('buildDirectory').value,
                    workingDirectory: document.getElementById('workingDirectory').value
                },
                compress: {
                    enabled: true,
                    target: document.getElementById('compressTarget').value,
                    outputName: document.getElementById('compressOutputName').value || document.getElementById('moduleName').value + '.zip'
                },
                upload: {
                    host: document.getElementById('uploadHost').value,
                    port: parseInt(document.getElementById('uploadPort').value),
                    username: document.getElementById('uploadUsername').value,
                    password: document.getElementById('uploadPassword').value,
                    remotePath: document.getElementById('uploadRemotePath').value
                },
                deploy: {
                    scriptName: document.getElementById('deployScriptName').value || document.getElementById('moduleName').value + '.sh',
                    scriptPath: document.getElementById('deployScriptPath').value || '.deploy/scripts/' + (document.getElementById('deployScriptName').value || document.getElementById('moduleName').value + '.sh')
                },
                hooks: {}
            };
            
            vscode.postMessage({
                command: 'saveModule',
                data: config
            });
        });
        
        document.getElementById('cancelBtn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'cancel'
            });
        });
        
        document.getElementById('testConnection').addEventListener('click', () => {
            const uploadConfig = {
                host: document.getElementById('uploadHost').value,
                port: parseInt(document.getElementById('uploadPort').value),
                username: document.getElementById('uploadUsername').value,
                password: document.getElementById('uploadPassword').value,
                remotePath: document.getElementById('uploadRemotePath').value
            };
            
            vscode.postMessage({
                command: 'testConnection',
                data: uploadConfig
            });
        });
        
        function generateId() {
            return 'module-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        }
        
        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'testConnectionResult':
                    const testBtn = document.getElementById('testConnection');
                    if (message.success) {
                        if (testBtn) {
                            testBtn.textContent = '✓ 连接成功';
                            testBtn.style.backgroundColor = 'var(--vscode-testing-iconPassed)';
                            setTimeout(() => {
                                testBtn.textContent = '测试连接';
                                testBtn.style.backgroundColor = '';
                            }, 3000);
                        }
                    } else {
                        if (testBtn) {
                            testBtn.textContent = '✗ 连接失败';
                            testBtn.style.backgroundColor = 'var(--vscode-testing-iconFailed)';
                            setTimeout(() => {
                                testBtn.textContent = '测试连接';
                                testBtn.style.backgroundColor = '';
                            }, 3000);
                        }
                        // 显示错误详情
                        const errorMsg = document.createElement('div');
                        errorMsg.style.color = 'var(--vscode-errorForeground)';
                        errorMsg.style.marginTop = '10px';
                        errorMsg.textContent = '错误: ' + (message.error || '连接失败');
                        const uploadSection = document.querySelector('.section');
                        if (uploadSection) {
                            const existingError = uploadSection.querySelector('.error-message');
                            if (existingError) {
                                existingError.remove();
                            }
                            errorMsg.className = 'error-message';
                            uploadSection.appendChild(errorMsg);
                            setTimeout(() => errorMsg.remove(), 5000);
                        }
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
}

