# Prometheus

**AI workforce management for people who actually want to get work done.**

I got tired of flashy AI tools that demo well but don't do anything useful. Every "agent platform" out there is either a glorified chatbot wrapper, a 47-step no-code workflow builder, or an over-engineered framework that needs a PhD to configure. None of them let me just set up AI workers and have them actually automate my work in a simple, straightforward way.

So I built Prometheus. It's a desktop app where you create AI employees, give them roles, tools, and knowledge, and they do real work — write files, browse the web, execute code, talk to each other, and delegate tasks autonomously. No workflow canvases, no drag-and-drop nonsense, no "prompt engineering studios." Just agents that work.

## What it does

- **AI Employees** — Create agents with custom roles, system prompts, tools, and persistent memory
- **Any LLM provider** — OpenAI, Anthropic, Google, Mistral, Ollama (local), Vercel AI Gateway (50+ models), or your Claude Code subscription directly via CLI
- **Real tools** — Web search, file read/write, code execution, MCP server integrations
- **Inter-agent communication** — Employees delegate tasks to each other and collaborate autonomously via structured Agent Briefs
- **Recurring tasks** — Schedule agents to run hourly, daily, or weekly
- **Knowledge system** — Shared documents that agents can create, reference, and auto-update
- **Persistent memory** — Agents remember important facts across conversations
- **File handling** — Upload files, drag-and-drop attachments, inline image previews
- **Departments & companies** — Organize agents into teams, manage multiple orgs
- **Desktop native** — Electron app, fast, your data stays on your machine

## Providers

| Provider | Models | Notes |
|----------|--------|-------|
| **Vercel AI Gateway** | 50+ models (Claude, GPT, Gemini, Grok, DeepSeek, Llama, Qwen, more) | One API key for everything |
| **OpenAI** | GPT-4o, o1, o3 | |
| **Anthropic** | Claude Opus, Sonnet, Haiku | |
| **Google** | Gemini 2.5 Pro & Flash | |
| **Mistral** | Large, Medium, Small, Codestral | |
| **Ollama Cloud** | DeepSeek 671B, Qwen 480B, more | Subscription-based |
| **Ollama (Local)** | Llama, Mistral, CodeLlama, anything | Free, offline |
| **Claude Code (CLI)** | Opus, Sonnet, Haiku | Uses your existing Claude subscription, no API key needed |

## Claude Code provider

Prometheus can use your existing Claude Code subscription as a provider — no API key, no extra charges. Enable "Claude Code (CLI)" in Settings, connect your account, and assign employees to it. Each agent runs as a Claude Code subprocess with full built-in tool access (file ops, web search, bash, MCP servers).

Requires the [Claude Code CLI](https://code.claude.com) installed and authenticated.

## Getting started

```bash
npm install
npm run dev
```

> Run `npm run dev` from Terminal.app, not the VS Code terminal — the `ELECTRON_RUN_AS_NODE` env var breaks Electron.

For browser preview (mock API, no Electron):
```bash
npm run dev:web
```

1. Open the app
2. Go to **Settings** — add an API key or connect Claude Code
3. **Hire** your first employee
4. Start chatting

## Tech stack

Electron 35 + Vite 8 + React 19 + TypeScript + Tailwind CSS v4 + Zustand

## License

MIT
