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

## Inter-Agent Task Delegation
- Employees can delegate work to other employees via `delegate_task` tool (based on `contactAccess` permissions)
- Tasks use the **Agent Brief** format (objective, context, deliverable, acceptance criteria, escalation conditions)
- Task data stored in `CompanyData.tasks[]`, CRUD via `tasks:*` IPC channels
- Agent manager injects team member list into system prompt and provides `delegate_task` tool to LLM
- Supports both OpenAI-compatible (function calling) and Anthropic (tool_use) formats
- Tasks page at `components/tasks/tasks-page.tsx` — grouped by status (escalated/pending/in_progress/completed)

## Builtin Tool Execution (Function Calling)
- Employee tools (`web-search`, `web-browse`, `file-read`, `file-write`, `code-execute`) are wired as real LLM function calling tools
- Tools are built for both OpenAI (`buildBuiltinToolsOpenAI`) and Anthropic (`buildBuiltinToolsAnthropic`) formats
- `executeBuiltinTool()` in agent-manager handles execution (web fetch, filesystem read/write, etc.)
- Tool call flow supports multi-round tool use (up to 5 rounds)
- `write_file` emits `chat:fileWritten` event to show download cards in chat UI

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

## Key Files
- `src/main/index.ts` — Electron entry, IPC handlers (store/agentManager init in `app.whenReady()`)
- `src/main/store.ts` — EmployeeStore class, JSON persistence, company-scoped data
- `src/main/types.ts` — All type definitions (Company, Employee, Task, etc.) + DEFAULT_PROVIDERS
- `src/main/agent-manager.ts` — LLM agent manager (OpenAI-compatible, Anthropic, Ollama; streaming; prompt caching; delegate_task + builtin tools; token counting; compression)
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
