# ResumeMatch

ResumeMatch 是一个本地优先的简历关键词匹配工作台。它可以读取 Word 简历和职位描述，检查关键词覆盖情况，辅助修改经历描述，并在尽量保留原始 Word 排版的前提下导出新版本。

## 主要功能

- 导入并管理多份 `.docx` 基础简历
- 从职位链接或粘贴文本读取职位描述
- 在本地词库中匹配职位关键词与简历证据
- 使用自备 API Key 调用多种大模型生成改写建议
- 对改写结果执行拼写、重复、标点和占位文字检查
- 保留原始 Word 文档结构并导出，避免覆盖已有文件
- 在 Electron 桌面版中使用本地 SQLite 保存项目和设置

## 环境要求

- Node.js 22.13 或更高版本
- npm
- Windows 桌面版需要 Electron 支持的 Windows 版本

## 安装与运行

安装依赖：

```sh
npm ci
```

启动 Windows 桌面开发版：

```sh
npm run desktop:dev
```

也可以双击 `start-resume-match.cmd`。该命令会启动本地页面服务并打开桌面窗口，关闭窗口后页面服务会一并停止。

仅开发浏览器界面时可以运行：

```sh
npm run dev
```

浏览器模式不会访问 Electron 的本地 SQLite、系统凭据存储和文件夹选择接口，适合界面调试，不适合作为完整桌面版替代品。

## 质量检查

提交代码前运行：

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` 生成可由 Vinext/Cloudflare Worker 运行的生产构建。`npm start` 可在本地预览已经生成的 Worker 构建。

## 本地数据

桌面版数据保存在源代码目录之外：

```text
%LOCALAPPDATA%\ResumeMatch\
├─ api-credentials.json
├─ runtime\
└─ data\
   ├─ database\resume-match.sqlite3
   └─ files\resumes\
```

API Key 使用 Electron 的系统安全存储加密后保存。简历原文件和 SQLite 数据库不会写入 Git 仓库。

默认导出目录是：

```text
%USERPROFILE%\Documents\ResumeMatch\Exports
```

可以在“设置 → 导出与命名”中修改目录和文件名模板。已有文件不会被覆盖，同名文件会自动增加数字后缀。

## 代码结构

```text
app/                 页面、样式和服务端 API
components/ui/       预置的 shadcn UI 组件库
electron/            Electron 主进程、本地数据库和预加载桥接
lib/                 关键词匹配、模型调用、校对和桌面存储适配
scripts/             开发、构建、测试及 Word 验证脚本
```

`components/ui/` 中包含一组完整的预置组件，当前产品只直接使用其中一部分。其余组件作为后续界面开发的基础设施保留，不属于废弃代码。

## Word 页面验证

Windows 上安装了 Microsoft Word 时，可以用 Word 自身的排版引擎验证页数：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify_docx_with_word.ps1 -InputPath 'D:\path\to\resume.docx'
```

如需同时生成临时 PDF 预览，可增加 `-PdfPath` 参数。脚本只读打开原文件，不会覆盖源文档。

## 发布

`.openai/hosting.json` 和 Sites/Vinext 构建脚本用于托管版本。发布前不要提交 `.env*`、本地运行状态、构建目录、导出文档或桌面数据库。
