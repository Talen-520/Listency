<p align="center">
  <img src="assets/Listency.png" alt="Listency" width="520" />
</p>

<h1 align="center">Listency</h1>

<p align="center">
面向小商家的本地优先桌面应用，用来运行 AI 电话助手。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="readme_cn.md">简体中文</a> · <a href="readme_ja.md">日本語</a>
</p>

<p align="center">
  <img alt="Tests" src="https://img.shields.io/badge/tests-unittest%20passing-brightgreen" />
  <a href="https://github.com/Talen-520/Listency/actions/workflows/windows-packaged-smoke.yml">
    <img alt="Windows packaged smoke" src="https://github.com/Talen-520/Listency/actions/workflows/windows-packaged-smoke.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/macos-packaged-smoke.yml">
    <img alt="macOS packaged smoke" src="https://github.com/Talen-520/Listency/actions/workflows/macos-packaged-smoke.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/release-draft.yml">
    <img alt="Release draft" src="https://github.com/Talen-520/Listency/actions/workflows/release-draft.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/releases">
    <img alt="Releases" src="https://img.shields.io/github/v/release/Talen-520/Listency?include_prereleases&label=release" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/coverage.yml">
    <img alt="Coverage" src="https://github.com/Talen-520/Listency/actions/workflows/coverage.yml/badge.svg" />
  </a>
  <img alt="Python" src="https://img.shields.io/badge/python-%3E%3D3.11-blue" />
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/Talen-520/Listency?label=last%20commit" />
</p>

## 界面预览

<details open>
  <summary><strong>深色主题</strong></summary>
  <br />
  <a href="assets/dark.png">
    <img src="assets/dark.png" alt="Listency 深色主题仪表盘" width="100%" />
  </a>
</details>

<details>
  <summary><strong>浅色主题</strong></summary>
  <br />
  <a href="assets/light.png">
    <img src="assets/light.png" alt="Listency 浅色主题仪表盘" width="100%" />
  </a>
</details>

## Listency 是什么？

Listency 帮助小商家在本地桌面应用中运行 AI 电话助手。

店铺、酒店、餐厅、美容院、诊所或服务型商家可以把电话号码连接到 AI 语音助手，让它接听客户来电、回答营业信息、收集预约详情、处理常见请求、在需要时转接人工，并保存通话记录供之后查看。

Listency 面向非技术用户。它提供一个简单的本地控制面板，而不是要求用户搭建云端后端、复杂后台或呼叫中心系统。

Listency 可在 macOS 和 Windows 本地运行。API key、商家信息、转写记录、工具调用和日志都保存在用户自己的电脑上。启用电话功能时，Listency 会创建一个临时安全隧道，让 Twilio 能把来电转发到本地应用。

## 核心功能

- 用于客户来电的 AI 电话助手
- 在自己的电脑上运行语音助手，无需部署服务器，可随时停止
- 连接真实电话号码前，可先用麦克风测试
- 支持多语言语音对话，具体取决于所选 AI provider 和模型
- 本地商家知识库，可保存营业时间、服务、价格、政策、FAQ 和预约规则
- 预约信息收集，并能标记缺失信息和需要员工确认的边界
- 遇到需要人工处理的来电时支持转接
- 对话结束后可由 AI 主动挂断
- 跟进事项 Inbox，并可开启桌面提醒，提示需要店主处理的任务
- 保存 transcript、工具调用记录、电话记录和运行日志
- 可导出诊断信息，帮助排查 provider、电话连接和运行状态问题
- API key、商家资料、日志和转写记录本地优先保存
- 支持 macOS 和 Windows 桌面应用体验
- 支持通过自动安全隧道连接 Twilio 电话号码

## 快速开始

普通用户：

1. 从 [GitHub Releases](https://github.com/Talen-520/Listency/releases) 下载 Listency 打包版本。
2. 打开桌面应用。
3. 在 Settings 中填写 OpenAI 和/或 Gemini API key，并点击保存。
4. 选择 provider、模型和声音。
5. 填写 Business Info，然后选择或编辑 Agent prompt。你可以为不同通话流程保存多个 agent。
6. 点击右上角 `Start` 启动 Runtime，按钮会切换为 `Stop`。
7. 真实来电必须连接一个电话 provider。第一版正式发布推荐使用 [Twilio](https://www.twilio.com)：在 Settings 中填写 Twilio Account SID、Auth Token 和电话号码，点击 `Connect Phone`，然后拨打配置好的号码测试。

Telnyx 目前仍属于 experimental，不建议在第一版正式发布中用于 production。

### 未签名版本的信任提示

当前公开构建会保持 unsigned。以下命令只应用于从本仓库下载的构建。

如果 macOS 显示 `"Listency" is damaged and can't be opened`，在解压或安装后移除下载隔离标记：

```bash
xattr -dr com.apple.quarantine /path/to/Listency.app
```

如果 Windows 阻止下载的安装包或 portable app，在解压后的 release 文件夹中打开 PowerShell，移除 Mark-of-the-Web 标记：

```powershell
Unblock-File .\Listency_0.1.0_x64-setup.exe
Get-ChildItem .\portable -Recurse | Unblock-File
```

这些提示是 unsigned 构建的预期行为。

开发者：

```bash
corepack enable
pnpm run dev:web
```

首次运行会创建后端虚拟环境、安装 Python 和桌面端依赖，然后启动 FastAPI 后端和 Vite 前端。打开 `http://127.0.0.1:5173/` 进行本地 UI 开发。

完整本地开发流程见 [Development](docs/DEVELOPMENT.md)。

## 当前状态

Listency 处于第一版 unsigned 公开发布阶段。推荐电话路径是 Twilio；Telnyx 仍为 experimental，后续版本可能移除或重新设计。

## 工作方式

<p align="center">
  <a href="assets/how-it-works.svg">
    <img src="assets/how-it-works.svg" alt="Listency 架构流程图" width="100%" />
  </a>
</p>

后端尽量保持薄：负责 session 管理、本地配置加载、工具回调、电话 webhook 处理和日志持久化。只有在 Test Call 或真实来电启动 AI session 时，才会调用外部 provider。

## 本地数据与隐私

- API key 和电话 provider 凭证保存在本地 `.env`。
- Sessions、transcripts、tool calls 和 phone records 保存在本地 SQLite。
- 打包版本会把本地数据保存在操作系统的应用数据目录。
- Business profile 文本和 prompts 默认保存在本地，只会在 active session 中发送给用户选择的 provider。
- 自动电话设置只会通过公网隧道暴露 `/phone/*` webhook 路由；普通本地 API 不会从公网隧道访问。

在 active session 中，provider API 仍可能接收音频、文本、prompt 和工具结果。使用真实客户数据前，请先阅读对应 provider 的数据政策。

## 文档

- [GitHub Releases](https://github.com/Talen-520/Listency/releases)
- [Unsigned Build Testing](docs/ALPHA_TESTING.md)
- [Phone Setup](docs/PHONE_SETUP.md)
- [Release And Signing](docs/RELEASE.md)
- [Development](docs/DEVELOPMENT.md)

面向开发 agent 的架构、设计和开发说明保存在本地 ignored `.agent/` 目录中。

## 贡献

本仓库仍处于早期阶段，聚焦的小 issue 和小型 PR 最容易 review。请保持 local-first 的设计原则，不要提交 secret 或客户数据；当行为发生变化时，请同步更新 `README.md` 或 `docs/`。

## License

Apache License 2.0. See `LICENSE`.
