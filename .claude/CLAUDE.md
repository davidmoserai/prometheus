# Prometheus - AI Workforce Management Platform

## Architecture
- **Electron 35 + Vite 8 + React 19 + TypeScript** desktop app with web preview mode
- **Renderer source**: `src/renderer/src/`
- **Main process**: `src/main/` (store, IPC handlers, agent manager)
- **UI framework**: Tailwind CSS v4 with `@theme` tokens in `globals.css`
- **State management**: Zustand (`src/renderer/src/stores/app-store.ts`)
- **Component library**: Custom components in `src/renderer/src/components/ui/`
- **Data persistence**: JSON file at `~/Library/Application Support/prometheus/prometheus-data/store.json`

## Important: Tailwind CSS v4 Spacing Bug
Tailwind spacing utilities (`p-7`, `mb-5`, `gap-6`, etc.) do NOT render at correct sizes in this project. **Always use inline `style={{ }}` for spacing** (padding, margin, gap). Keep Tailwind for colors, borders, typography, flex/grid, transitions, rounded corners.

## Design System
- **Theme**: Dark-only, premium aesthetic
- **Accent**: Flame/ember orange (`flame-500: #f97316`)
- **Backgrounds**: Use semantic tokens `bg-bg-primary` (#09090b), `bg-bg-secondary` (#131316), `bg-bg-tertiary` (#1c1c21), `bg-bg-elevated` (#26262d), `bg-bg-surface` (#323239)
- **Borders**: Use `border-border-subtle`, `border-border-default`, `border-border-bright`
- **Cards/surfaces**: `bg-bg-elevated` with `border-border-default`
- **Inputs/selects**: `bg-bg-tertiary` with `border-border-default`, `borderRadius: '12px'` via inline style
- **Spacing**: Use inline styles — 48px page padding, 28px card padding, 24px grid gaps, 40-56px section margins
- **Typography**: 13-14px body, 28px page headers, Inter font
- **Dropdowns/menus**: Solid `backgroundColor: '#2a2a32'` (not Tailwind class), inline `borderRadius`

## Providers (7 total)
- **Vercel AI Gateway** — 50+ models, one API key, `https://ai-gateway.vercel.sh/v1`
- **OpenAI** — GPT-4o, o1
- **Anthropic** — Claude Opus, Sonnet, Haiku
- **Google** — Gemini 2.5 Pro/Flash
- **Mistral** — Large, Medium, Small, Codestral
- **Ollama Cloud** — DeepSeek 671B, Qwen 480B via subscription, `https://ollama.com/api`
- **Ollama (Local)** — Free local models at `localhost:11434`

## Inter-Agent Communication
- **Task delegation**: `delegate_task` tool for formal work assignments (Agent Brief format)
- **Agent-to-agent chat**: `message_employee` tool for quick questions/collaboration between agents
- Agent chats stored as conversations with `peerEmployeeId` linking the two participants
- `executeAgentMessage()` in agent-manager finds/creates conversation, runs target agent, returns response
- Tasks use the **Agent Brief** format (objective, context, deliverable, acceptance criteria, escalation conditions)
- Task data stored in `CompanyData.tasks[]`, CRUD via `tasks:*` IPC channels
- Agent manager injects team member list into system prompt and provides both tools to LLM
- Tasks page at `components/tasks/tasks-page.tsx` — grouped by status (escalated/pending/in_progress/completed)

## Tool System (Mastra + Zod Definitions)
- Tools built dynamically per request in `buildMastraTools()` using Mastra `createTool` + Zod schemas
- **Memory tools** (always available): `save_memory`, `create_knowledge_doc`, `update_knowledge_doc`
- **Builtin tools** (per employee config): `web_search`, `web_browse`, `read_file`, `write_file`, `execute_code`
- **MCP tools**: External tools from connected MCP servers via `@mastra/mcp` package
- **Delegation**: `delegate_task`, `message_employee` (when employee has contactable employees)
- **Scheduling**: `create_scheduled_task` (always available)
- **Tool call visibility**: `onToolCall` callback emits `chat:toolCall` IPC events for save_memory, knowledge docs, delegate/message tools
- Tool call notices displayed inline in chat as subtle cards with icons (Brain, FileText, Users)
- `write_file` emits `chat:fileWritten` event to show download cards in chat UI

## MCP Server Integration
- **Package**: `@mastra/mcp` — MCPClient connects to stdio-based MCP servers
- **Manager**: `src/main/mcp-manager.ts` — MCPManager class manages multiple MCP server connections and tool discovery
- **Config**: `MCPServerConfig` type in `types.ts` — `{ id, name, command, args, env, enabled }`
- **Storage**: `AppSettings.mcpServers: MCPServerConfig[]` — persisted in JSON store
- **IPC channels**: `mcp:list`, `mcp:add`, `mcp:update`, `mcp:remove`, `mcp:getTools`, `mcp:testConnection`
- **Tool namespacing**: MCP tools prefixed with `mcp_{serverId}_{toolName}` to avoid collisions with builtin tools
- **Employee integration**: `ToolAssignment.mcpServerId` links MCP tools to their server; `mergeEmployeeMcpTools()` in agent-manager merges enabled MCP tools per employee
- **Settings UI**: MCP Servers section in settings page — add/remove servers, view discovered tools, toggle enable/disable
- **Employee editor**: Tools tab has expandable sections — "Built-in" section + one "MCP: {name}" section per connected server
- **Lifecycle**: MCPManager connects to all enabled servers on app start, disconnects on app quit
- **Mock API**: `mcp` namespace with stubs for web preview mode

## Agent Memory System
- `Employee.memory: string` — persistent memory field, survives across conversations
- Agents use `save_memory` tool to save important facts/decisions/preferences
- Memory injected into system prompt under "# Your Memory" section
- Employee editor shows memory (read-only) with "Clear Memory" button
- Agents can create/update knowledge docs via `create_knowledge_doc` / `update_knowledge_doc` tools
- Knowledge doc IDs shown in system prompt so agents can reference them
- `KnowledgeDocument` has `docType` ('living' | 'reference') — no verification/review system (removed for simplicity)
- Agents are instructed to auto-update knowledge docs when they learn contradicting information

## File Upload in Chat
- `ChatAttachment` type: `{ id, filename, path, mimetype, size }`
- `ChatMessage.attachments?: ChatAttachment[]` — optional attachments on messages
- `store.uploadFile(conversationId, sourcePath)` — copies file to `{userData}/prometheus-data/files/{conversationId}/`
- `store.deleteConversation()` cleans up conversation files directory via `rmSync`
- IPC: `files:pick` (opens native file dialog), `files:upload` (copies and returns metadata)
- Chat UI: Paperclip button to pick files, drag-and-drop on input area, image preview thumbnails for staged attachments
- Image attachments rendered inline in message bubbles

## Token Counting + Conversation Compression
- `countTokens()` uses `Math.ceil(text.length / 4)` heuristic
- `compressConversation()` summarizes older messages via LLM, keeps last 4 messages
- Chat header shows token count and "Compress" button when > 4000 tokens
- IPC channels: `chat:countTokens`, `chat:compress`

## Recurring Tasks (Scheduler)
- `src/main/scheduler.ts` — Scheduler class checks every 60 seconds for due recurring tasks
- RecurringTask type: `schedule` (hourly/daily/weekly), `scheduleTime`, `enabled`, `nextRunAt`
- CRUD via `recurringTasks:*` IPC channels, stored in `CompanyData.recurringTasks[]`
- Tasks page has "Scheduled Tasks" section with create/edit form, enable/disable toggle
- Scheduler auto-creates conversations and delegates tasks to employees

## Notification System
- **Native notifications**: Electron `Notification` API fires for task completed, task escalated, recurring task executed
- **In-app notification center**: Bell icon in sidebar bottom, opens `NotificationPanel` dropdown
- **Store**: `AppNotification` type in Zustand store with `addNotification`, `markNotificationRead`, `markAllNotificationsRead`, `clearNotifications`
- **IPC bridge**: Main process sends `notification` events via `webContents.send()`, preload exposes `notifications.onNotification()`, App.tsx listens and adds to store
- **Types**: `task_completed`, `task_escalated`, `recurring_executed`, `tool_approval` (future), `info`
- **Component**: `components/notifications/notification-panel.tsx` — dropdown panel with unread dot, mark all read, click-to-navigate

## Key Files
- `src/main/index.ts` — Electron entry, IPC handlers (store/agentManager init in `app.whenReady()`)
- `src/main/store.ts` — EmployeeStore class, JSON persistence, company-scoped data
- `src/main/types.ts` — All type definitions (Company, Employee, Task, etc.) + DEFAULT_PROVIDERS
- `src/main/agent-manager.ts` — LLM agent manager (unified Zod tool defs; memory/knowledge tools; MCP tool merging; OpenAI-compatible, Anthropic, Ollama routing; streaming; prompt caching; token counting; compression)
- `src/main/mcp-manager.ts` — MCP server connection manager (connect, disconnect, tool discovery)
- `src/main/scheduler.ts` — Recurring task scheduler (60s interval check)
- `src/preload/index.ts` — Secure IPC bridge
- `src/renderer/src/lib/mock-api.ts` — Mock API for web preview mode
- `globals.css` — Theme tokens, animations
- `components/ui/` — card, button, input, badge, switch, textarea (spacing via inline styles)
- `components/layout/sidebar.tsx` — Navigation, company switcher (inline dropdown, not absolute)
- `components/tasks/tasks-page.tsx` — Task delegation dashboard (grouped by status, expandable briefs)
- `electron.vite.config.ts` — Build config (uses `externalizeDepsPlugin()`)

## Running
- **Desktop app**: `npm run dev` from Terminal.app (not VS Code terminal — `ELECTRON_RUN_AS_NODE` env var breaks Electron)
- **Web preview**: `npm run dev:web` (browser at `localhost:5173`, uses mock API)
- **Build**: `npm run build`

## Version
- Current: **1.0.0**
- App icon: `resources/icon.png` / `resources/icon.icns` (flame on dark background)
