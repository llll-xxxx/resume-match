# ResumeMatch

[English](#english) | [简体中文](#chinese)

<a id="english"></a>

## English

Want to tailor your resume to a job without handing it over to AI for an unchecked rewrite? ResumeMatch shows you what is worth changing, and you decide which suggestions to use.

When you apply for different jobs, the relevant experience may already be in your resume—the wording just doesn't match the job description. Other requirements need a more important question: have you actually done this work? ResumeMatch displays the job description beside your Word resume and highlights job keywords in green, yellow, and red. You can see what is covered, what could be phrased differently, and what is missing. Clearer, accurate wording can also make relevant experience easier for recruiters to find when they search resumes by keyword in an applicant tracking system (ATS). It cannot guarantee that a resume will pass a particular screening process.

### What do the colors mean?

- 🟢 **Green | Covered:** Your resume already contains the relevant term. Variations such as plurals and verb tenses count as covered, so there is usually nothing to change.
- 🟡 **Yellow | Similar meaning, different wording:** You have relevant experience, but your resume uses a different term from the job description. Open the highlight to review a synonym-based replacement and apply it if the wording accurately describes your work.
- 🔴 **Red | Not yet covered:** The requirement is not clearly reflected in your resume. Review LLM suggestions grounded in your existing experience, edit a suggestion before accepting it, or revise the resume bullet yourself. You can also add factual details about your work and ask the LLM to polish the English.

A red highlight does not mean you must force a keyword into your resume. If you do not have the experience, you can ignore it. ResumeMatch instructs the LLM to work from your resume and the facts you provide, and checks important details such as numbers to reduce invented claims. AI can still make mistakes: review every statement before you send your resume.

### Edit the wording without fighting the layout

Changing a few words in a resume can add an unwanted line and shift the rest of the page. ResumeMatch constrains automatic rewrite suggestions by the character count of the original Word bullet. Before applying a change, it also checks the line count against the actual paragraph width in the Word preview. If the new wording adds a line, the app stops the change and asks you to shorten it. Open the exported file in Word for a final layout check.

### Download, install, and open

Download `ResumeMatch-0.1.0-beta-Setup.exe` from [GitHub Releases](https://github.com/llll-xxxx/resume-match/releases). Run the installer, then open ResumeMatch from the Start menu or its desktop shortcut. The `Source code (zip)` and `Source code (tar.gz)` files are source archives, not installers.

This is a Windows x64 beta release without a code-signing certificate. If Windows warns that the publisher is unverified, check that you downloaded the installer from this repository's Release page before deciding whether to continue.

### Get started

1. Import a `.docx` file under **基础简历** (Base Resumes).
2. Create an application project, choose a resume, and paste the job description or enter a link to the job posting.
3. Select **读取 JD 并开始匹配** (Read JD and start matching). Review the highlighted keywords alongside the Word preview; work through the yellow and red items, or ignore requirements that do not apply. If the job page cannot be read automatically, paste its text instead.
4. Proofread and export a new `.docx` file. Your original resume is not overwritten.

### Set up an LLM API

Basic matching and synonym-based yellow suggestions do not require an API key. To get LLM suggestions for red items or use **用 LLM 润色** (Polish with LLM), set up your own model service:

1. Open **设置 → 模型服务** (Settings → Model service).
2. Choose a provider and enter its API key.
3. Select **验证密钥并读取模型** (Verify key and load models), then choose or enter a model.

Supported providers include OpenAI, Gemini, Claude, DeepSeek, GLM, Grok, and Qwen, as well as custom OpenAI-compatible services. When you use an LLM feature, the relevant job description, resume text, and any details you provide are sent to your selected provider. Charges depend on your provider and API account.

### Files and privacy

Base resumes, application projects, and settings are stored under `%LOCALAPPDATA%\ResumeMatch\` for the current Windows user. Exports go to `Documents\ResumeMatch\Exports` by default; you can change the folder and file naming under **设置 → 导出与命名** (Settings → Export and naming). Existing exports are not overwritten.

Your API key is encrypted locally using Windows secure storage. Reading a job posting from a link requires an internet connection; matching pasted text and local proofreading do not require an LLM API key.

This is a beta release. Report problems in [Issues](https://github.com/llll-xxxx/resume-match/issues). For project structure, development, build, and release notes, see the [development guide](docs/DEVELOPMENT.md).

<a id="chinese"></a>

## 简体中文

想让简历更贴近岗位要求，又不想把它交给 AI 一键改得面目全非？ResumeMatch 帮你找出值得修改的地方，每一处建议都由你决定是否采用。

投不同岗位时，很多经历其实已经写在简历里，只是表达方式和职位描述对不上；还有一些要求，则需要你判断自己是否真的做过。ResumeMatch 将职位描述与 Word 简历并排展示，用红黄绿三种颜色高亮职位关键词，让你一眼看出哪些已经覆盖、哪些可以换个说法、哪些尚未体现。你可以据此调整简历用词，让真实经历更容易被招聘者看到，也更便于使用关键词检索的 ATS（申请人追踪系统）发现。它不能保证简历通过某个招聘系统的筛选。

### 红黄绿灯怎么看？

- 🟢 **绿色｜已覆盖**：简历中已经有对应内容。单复数、时态等同词变化也会识别为已覆盖，通常不用修改。
- 🟡 **黄色｜意思相近，建议调整用词**：你有相关经历，只是简历中的说法和职位描述不同。点开提示，查看近义词改写建议；合适的话，就把现有表达替换成更贴近岗位要求的用词。
- 🔴 **红色｜尚未覆盖**：简历中还没有明确体现这项要求。你可以查看 LLM 根据现有经历给出的补充建议，选择采用、修改，或自己编辑这条经历；也可以补充真实细节，再请 LLM 帮你完善英文表达。

请放心，红色不等于必须硬塞一个关键词进去。没有相关经历，就忽略它。对于需要 LLM 帮忙的修改，ResumeMatch 会要求模型依据你的简历和补充材料提出建议，并检查数字等关键信息，尽量减少凭空编造。AI 仍可能出错，所以最终写进简历的每句话，都值得你亲自确认。

### 改几个词，不用重新折腾整页排版

改简历最烦的一件事：明明只换了几个词，条目却突然多出一行，后面的内容跟着挤乱。ResumeMatch 会以原 Word 条目的字符数约束自动改写建议；采纳时，还会按照 Word 预览中的实际段落宽度检查行数。如果修改让原条目多出一行，应用会被阻止，并提示你压缩措辞。导出后，建议再用 Word 打开检查一次最终版式。

### 下载、安装和打开

在 [GitHub Releases](https://github.com/llll-xxxx/resume-match/releases) 下载 `ResumeMatch-0.1.0-beta-Setup.exe`，双击安装，然后从开始菜单或桌面快捷方式打开。页面上的 `Source code (zip)` 和 `Source code (tar.gz)` 是源代码，不是安装包。

目前提供的是 Windows x64 测试版，尚未配置代码签名证书。如果 Windows 提示发布者未经验证，请先确认安装包来自本项目的 Release 页面，再决定是否继续安装。

### 第一次使用

1. 在“基础简历”中导入你的 `.docx` 简历。
2. 新建申请项目，选择简历，并粘贴职位描述或填写招聘页面链接。
3. 点击“读取 JD 并开始匹配”，对照职位描述和 Word 预览，逐条处理黄色、红色提示。不适用的要求可以忽略。如果网页无法自动读取，直接粘贴职位描述正文。
4. 完成修改后，运行校对并导出新的 `.docx` 文件。原始简历不会被覆盖。

### 设置 LLM API

基础匹配和黄色提示的近义词调整不需要 API Key。要获取红色提示的改写建议，或使用“用 LLM 润色”，请先完成设置：

1. 打开“设置 → 模型服务”。
2. 选择服务商，填写对应的 API Key。
3. 点击“验证密钥并读取模型”，然后选择或填写要使用的模型。

应用支持 OpenAI、Gemini、Claude、DeepSeek、GLM、Grok、通义千问等服务，以及兼容 OpenAI 接口的自定义服务。调用模型时，相关职位描述、简历文字和你补充的材料会发送给所选服务商；是否收费取决于你的 API 账户和服务商。

### 文件保存与隐私

基础简历、申请项目和设置保存在当前 Windows 用户的 `%LOCALAPPDATA%\ResumeMatch\` 目录。默认导出目录为“文档\ResumeMatch\Exports”；可以在“设置 → 导出与命名”中更改目录和文件名。已有导出文件不会被覆盖。

API Key 通过 Windows 安全存储加密后保存在本机。从链接读取职位描述需要联网；对已粘贴的文本进行匹配和本地校对不需要 LLM API Key。

这是一个测试版。遇到问题可以在 [Issues](https://github.com/llll-xxxx/resume-match/issues) 中反馈。项目结构、开发、构建和发布说明见 [开发文档](docs/DEVELOPMENT.md)。
