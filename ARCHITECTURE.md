# voiceAgent Architecture

## 1. 项目定位

`voiceAgent` 是一个只推荐本地运行的开源 AI Voice Agent 桌面应用。

第一版目标不是云端平台，而是一个本地控制台：

- 用户在 GUI 中填写 API Key、商家资料、system prompt、voice 和工具开关。
- API Key 存在本地 `.env`，不进入 SQLite，不提交 git。
- 后台程序可以 24/7 standby。
- AI 对话 session 只在 Test Call 或未来电话呼入时创建。
- 单次 AI session 最长 5 分钟，超时自动释放连接。

## 2. 当前架构总览

```text
Tauri Desktop App
  React + Tailwind + shadcn-style UI
  Mic capture: 16kHz mono PCM16
        |
        | HTTP / WebSocket on localhost
        v
Python FastAPI Backend
  Runtime/session manager
  .env config store
  Provider adapters
  Tool registry
  SQLite storage
        |
        v
Realtime Providers
  OpenAI Realtime adapter boundary
  Gemini Live adapter boundary
```

当前已经实现的是本地 app/backend 骨架、配置、SQLite、工具系统、session 生命周期、前端麦克风 PCM16 采集、后端 WebSocket 音频通道。

下一步真正要接的是 provider transport：

- OpenAI Realtime：把后端收到的 PCM16 chunk 转成 `input_audio_buffer.append`。
- Gemini Live：把后端收到的 PCM16 chunk 转成 Live API realtime input。
- Provider 返回的音频 chunk 再通过当前 WebSocket 发回前端播放。

## 3. 主要目录

```text
.
├── ARCHITECTURE.md
├── AGENTS.md
├── DESIGN.md
├── DEVELOPMENT.md
├── MVP_PLAN.md
├── update_logs/
├── scripts/
├── app/
│   ├── backend/
│   │   ├── voice_agent/
│   │   │   ├── main.py
│   │   │   ├── config/
│   │   │   ├── core/
│   │   │   ├── providers/
│   │   │   ├── storage/
│   │   │   └── tools/
│   │   └── tests/
│   └── desktop/
│       ├── src/
│       └── src-tauri/
└── data/
```

### Top-Level Docs

- `README.md`：项目简介。
- `AGENTS.md`：Codex / coding agent 工作规则。
- `ARCHITECTURE.md`：当前系统架构和开发入口，新 session 必读。
- `DESIGN.md`：UI 视觉方向。
- `DEVELOPMENT.md`：本地开发、测试、构建命令。
- `MVP_PLAN.md`：产品计划和里程碑。
- `update_logs/`：每次 commit 前记录变更历史。

### Backend

Backend 在 `app/backend/voice_agent/`。

- `main.py`：FastAPI app，HTTP routes 和 WebSocket route。
- `config/env_store.py`：本地 `.env` 读写和 public config masking。
- `config/paths.py`：repo root 和 data dir 路径。
- `core/session_manager.py`：后台 runtime、5 分钟 session timeout、active session 状态。
- `core/state.py`：runtime/session/end reason enum。
- `providers/`：OpenAI Realtime 和 Gemini Live adapter 边界。
- `storage/database.py`：SQLite schema 和 persistence helpers。
- `tools/`：tool registry 和内置工具。

### Desktop

Desktop 在 `app/desktop/`。

- `src/App.tsx`：当前主 UI，包含 Dashboard、Settings、Business Info、Tools、Test Call、Logs。
- `src/lib/api.ts`：前端访问本地 backend 的 HTTP/WebSocket helper。
- `src/lib/types.ts`：前端共享类型。
- `src/components/ui/`：shadcn-style 基础组件。
- `src-tauri/`：Tauri 原生壳配置和 Rust entrypoint。

## 4. Backend API

默认 backend 地址：

```text
http://127.0.0.1:8765
```

主要 HTTP endpoints：

```text
GET  /health
GET  /config
PUT  /config
GET  /providers
GET  /runtime/status
POST /runtime/start
POST /runtime/stop
POST /sessions/test
POST /sessions/{session_id}/stop
GET  /sessions
GET  /transcripts
GET  /business-profile
PUT  /business-profile
GET  /agent
PUT  /agent
GET  /tools
PUT  /tools/{tool_name}/enabled
POST /tools/{tool_name}/call
GET  /tool-calls
```

WebSocket endpoint：

```text
WS /sessions/{session_id}/stream
```

当前 WebSocket 支持：

- `audio.start`
- binary PCM16 audio chunks
- `audio.stop`
- `ping`

后端回推：

- `session.ready`
- `audio.input_started`
- `audio.input_stopped`
- `audio.chunk_ack`
- `session.error`
- `session.ended`
- `pong`

## 5. Session 生命周期

后台 runtime 和 AI session 是分离的。

后台 runtime：

```text
stopped -> starting -> standby -> stopping -> stopped
                         |
                         -> degraded / error
```

AI session：

```text
idle -> starting -> running -> stopping -> stopped
                         |
                         -> timeout
                         -> error
```

规则：

- `Start` 只让本地后台进入 `standby`。
- `Test Call` 或未来电话呼入才创建 realtime session。
- session 创建时写入 SQLite `sessions`。
- session 最长 5 分钟，由 `SessionManager` timeout task 自动结束。
- session 结束时写入 `ended_reason`。
- 前端 WebSocket 断开不等于一定结束 session；显式 stop 或 timeout 才结束。

结束原因：

```text
user_stopped
caller_hung_up
timeout_5_minutes
provider_error
network_error
backend_shutdown
```

## 6. 音频流

当前前端 Test Call 音频链路：

```text
navigator.mediaDevices.getUserMedia()
  -> AudioContext
  -> ScriptProcessorNode
  -> downsample to 16kHz
  -> float32 to PCM16 little-endian
  -> WebSocket binary chunks
  -> FastAPI backend
```

当前后端收到 chunk 后：

- 更新 active session 的 `audio_chunks`。
- 更新 active session 的 `audio_bytes`。
- 第一次收到音频时写入一条 system transcript。
- 回推 `audio.chunk_ack` 给前端。

Provider 接入位置：

- 在 `SessionManager.receive_audio_chunk()` 或新的 provider transport 层中，把 PCM16 chunk 转发给 active provider。
- OpenAI Realtime 用 `input_audio_buffer.append`。
- Gemini Live 用 realtime input media/audio event。

## 7. Provider Adapter

Provider adapter 位于：

```text
app/backend/voice_agent/providers/
```

当前 adapter 是边界层，还没有真实远程音频 transport。

接口概念：

```text
validate_config(env)
list_voices(env)
start_session(session_id, env)
close_session(handle)
```

当前 provider：

- `openai`：`OpenAIRealtimeAdapter`
- `gemini`：`GeminiLiveAdapter`

下一步建议新增 transport 方法：

```text
send_audio(handle, pcm16_chunk)
receive_events(handle)
send_tool_result(handle, tool_call_id, output)
```

不要让前端直接连接模型 provider。API Key 必须留在 backend `.env`。

## 8. Tool System

Tool registry 位于：

```text
app/backend/voice_agent/tools/
```

每个 tool 包含：

- `name`
- `description`
- `input_schema`
- `enabled`
- `handler`

当前内置工具：

- `business_info_lookup`
- `create_booking`
- `transfer_call`
- `log_customer_request`

工具调用会写入 SQLite `tool_calls`。

Provider function calling 接入时，不要让模型直接执行任意代码；必须经由 registry 查找、schema 校验、handler 执行、结果回传。

## 9. Storage

SQLite 默认路径：

```text
data/voice_agent.sqlite3
```

当前表：

```text
settings
agents
business_profiles
sessions
messages
transcripts
tool_calls
bookings
app_logs
```

本地生成数据不进 git：

- `.env`
- `data/`
- `app/backend/.venv/`
- `app/desktop/node_modules/`
- `app/desktop/dist/`
- `app/desktop/src-tauri/target/`

## 10. Config

`.env.example` 是可提交模板。

`.env` 是本地配置文件，不提交。

当前 keys：

```text
OPENAI_API_KEY=
GEMINI_API_KEY=
DEFAULT_REALTIME_PROVIDER=openai
DEFAULT_VOICE=
```

前端 Settings 页面保存配置时：

- 调用 backend `PUT /config`。
- backend 写 `.env`。
- public config 会 mask API key。
- 空 key 输入不会清空已有 key，只有填写新 key 才覆盖。

## 11. Dev Commands

Backend：

```bash
cd app/backend
source .venv/bin/activate
uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload
```

Frontend：

```bash
cd app/desktop
pnpm run dev
```

Tauri build：

```bash
cd app/desktop
pnpm run tauri:build
```

Tests：

```bash
cd app/backend
python -m unittest discover -s tests
```

WebSocket smoke test：

```bash
cd app/backend
source .venv/bin/activate
python ../../scripts/smoke_ws.py
```

## 12. Current Known Limits

- Provider adapter 已有边界，但还没有真实 OpenAI/Gemini 远程音频 transport。
- 前端还没有播放 provider 返回的音频 chunk。
- Tauri `.app` 可以 build；DMG 暂时不是 MVP 默认目标。
- 当前 Test Call 的 transcript 是本地 system transcript，不是模型真实转写。
- 电话 provider 只预留架构，还没接入 Twilio/Telnyx/SIP。

## 13. Before Starting A New Codex Session

新 session 先读：

1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `DEVELOPMENT.md`
4. `MVP_PLAN.md`
5. `update_logs/README.md`
6. `update_logs/` 中最新的 1-3 条记录

然后再看具体代码。
