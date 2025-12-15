# Alphonse Deploy

一个功能强大的 VSCode 插件，用于模块化项目的构建、压缩、上传和部署。

## 功能特性

- 🔍 **自动模块检测**: 自动识别项目中的 npm、Maven 和 Python 模块
- ⚙️ **灵活配置**: 为每个模块单独配置构建命令、压缩选项和服务器信息
- 📦 **自动压缩**: 支持将构建结果压缩为 ZIP 文件
- 🚀 **SCP 上传**: 通过 SCP 协议将文件上传到远程服务器
- 🎯 **自动部署**: 在服务器上自动执行部署脚本
- 🔗 **钩子支持**: 在构建、上传、部署的各个阶段支持自定义钩子

## 安装

1. 在 VSCode 中打开项目
2. 按 `F5` 启动调试模式，或使用 `npm run compile` 编译后打包

## 使用方法

### 找到插件视图

1. 安装插件后，在 VSCode 左侧活动栏（Activity Bar）中查找"部署管理"图标
2. 如果看不到图标，可以右键点击活动栏，选择"视图" -> "部署管理"
3. 点击"部署管理"图标后，侧边栏会显示两个视图：
   - **模块列表**：显示已配置的模块
   - **模块配置**：用于配置模块的 Webview 面板

### 1. 检测模块

1. 在"模块列表"视图的标题栏，点击"检测模块"按钮（搜索图标）
2. 插件会自动扫描项目中的模块（npm、Maven、Python）
3. 选择要添加的模块（支持多选）
4. 选择后，第一个选中的模块会自动打开配置面板，其他模块会使用默认配置自动添加

### 2. 配置模块

1. 检测模块后会自动打开配置面板，或在"模块配置"视图中进行配置
2. 在配置界面中填写：
   - 模块名称和类型
   - 构建命令和输出目录
   - 压缩配置
   - 服务器连接信息（可使用"测试连接"按钮验证）
   - 部署脚本路径
3. 点击"保存"完成配置

### 3. 执行操作

右键点击模块，可以选择：
- **编辑模块**: 打开配置面板编辑模块配置
- **执行部署**: 完整部署流程（构建 → 压缩 → 上传 → 执行脚本）
- **删除模块**: 删除模块配置
- **构建模块**: 仅执行构建命令
- **上传模块**: 压缩并上传到服务器（不执行部署脚本）
- **部署模块**: 在服务器上执行部署脚本（不执行构建和上传）
- **构建并部署**: 一次性完成构建、上传和部署

## 配置说明

### 配置文件位置

- **工作区配置**：当打开工作区时，配置文件存储在项目根目录的 `.deploy/config.json` 文件中
- **全局配置**：当未打开工作区时，使用全局存储路径的配置

### 目录结构

插件会在项目根目录创建 `.deploy` 目录，结构如下：

```
.deploy/
├── config.json          # 模块配置文件
├── scripts/             # 部署脚本目录（需要手动创建脚本）
│   └── module-name.sh   # 部署脚本示例
└── output/              # 压缩文件输出目录（自动创建）
    └── module-name.zip  # 压缩后的文件
```

### 部署脚本

**重要**：部署脚本需要用户手动创建。插件不会自动生成部署脚本。

1. 在项目根目录创建 `.deploy/scripts/` 目录（如果不存在）
2. 创建部署脚本文件，例如 `deploy.sh`
3. 脚本内容示例：

```bash
#!/bin/bash
# 解压文件
cd /var/www/frontend
unzip -o frontend.zip
# 其他部署操作...
```

4. 在模块配置中指定脚本路径，例如：`.deploy/scripts/deploy.sh`

部署时，插件会：
- 将脚本上传到服务器的 `remotePath` 目录
- 自动赋予脚本执行权限
- 使用 `sudo -S` 以 root 权限执行脚本

### 模块配置示例

```json
{
  "modules": [
    {
      "id": "module-1",
      "name": "frontend",
      "type": "npm",
      "path": "frontend",
      "build": {
        "command": "npm run build",
        "directory": "./dist",
        "workingDirectory": "frontend"
      },
      "compress": {
        "enabled": true,
        "target": "./dist",
        "outputName": "frontend.zip"
      },
      "upload": {
        "host": "192.168.1.100",
        "port": 22,
        "username": "user",
        "password": "password",
        "remotePath": "/var/www/frontend"
      },
      "deploy": {
        "scriptName": "deploy.sh",
        "scriptPath": ".deploy/scripts/deploy.sh"
      },
      "hooks": {}
    }
  ],
  "globalHooks": {}
}
```

## 支持的项目类型

- **npm/Vue**: 检测 `package.json`
- **Maven**: 检测 `pom.xml`
- **Python**: 检测 `requirements.txt` 或 `setup.py`

## 执行部署流程

"执行部署"功能会按以下顺序执行：

1. **构建**：在模块的工作目录执行构建命令
2. **压缩**：将构建输出目录压缩为 ZIP 文件，保存到 `.deploy/output/` 目录
3. **上传**：通过 SCP 将压缩文件上传到服务器指定路径
4. **部署**：上传部署脚本到服务器，赋予执行权限，并使用 `sudo -S` 以 root 权限执行

所有步骤都有进度提示，详细日志会输出到 "Alphonse Deploy" 输出通道。

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch
```

## 许可证

MIT

