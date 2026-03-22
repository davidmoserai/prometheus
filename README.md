# Prometheus — AI Workforce Management Platform

**Create, manage, and orchestrate AI employees that work together.** Like having your own AI-powered company.

Prometheus is a desktop app that turns AI models into specialized employees with defined roles, tools, shared knowledge, and the ability to collaborate — replacing the fragmented experience of juggling multiple AI tools, browser tabs, and disconnected conversations.

## Why Prometheus?

### The Problem with Existing Tools

**Claude Projects** is useful but limited. You're locked into Anthropic's ecosystem, can't use multiple providers, and "projects" don't communicate with each other. There's no concept of roles, permissions, or delegation between AI agents.

**OpenClaw** and similar multi-provider tools are powerful but complex. Setting up authentication, configuring providers, and managing agents requires technical knowledge and terminal commands. The UX isn't friendly for non-developers.

**ChatGPT, Gemini, and other chat apps** give you one conversation at a time with one model. No team structure, no shared knowledge, no task handoffs.

### What Prometheus Does Differently

Prometheus gives you an **AI workforce** — not just a chatbot. Each AI employee has:

- A **name, role, and personality** (system prompt)
- **Assigned tools** — web search, file access, code execution, and custom MCP tools
- **Shared knowledge base** — markdown documents referenced across your team
- **Contact permissions** — control which employees can delegate tasks to each other
- **Provider flexibility** — assign any model from any provider to any employee

You're the CEO. Your AI employees work for you.

## Features

- **Multi-Company Support** — Manage multiple organizations with separate teams and data
- **Departments** — Organize employees into teams (Engineering, Creative, Research, etc.)
- **HR-Style Management** — Hire, fire, and rehire AI employees
- **7 AI Providers** — Vercel AI Gateway (50+ models), OpenAI, Anthropic, Google, Mistral, Ollama Cloud, Ollama Local
- **Vercel AI Gateway** — One API key for Claude, GPT, Gemini, Grok, DeepSeek, Llama, Qwen, and more
- **Ollama Cloud** — Access DeepSeek 671B, Qwen 480B and other large open-source models via $20/mo subscription
- **Ollama Local** — Run models locally for free with zero data leaving your machine
- **Granular Permissions** — Per-employee control over web access, file operations, code execution, and inter-employee communication
- **Contact Access Control** — Define which employees can talk to each other, by department or individually
- **Knowledge Base** — Create and assign markdown documents as shared context
- **Real-Time Chat** — Stream responses with conversation history
- **Dark-Only Premium UI** — Fire-inspired design system with ember gradients and flame accents
- **100% Local Data** — All data stored on your machine, never sent to third parties

## Getting Started

```bash
# Install dependencies
npm install

# Run the desktop app
npm run dev

# Or preview in browser (no Electron needed)
npm run dev:web
```

1. Open the app and go to **Settings**
2. Enable a provider and enter your API key
3. Go to **Employees** and hire your first team member
4. Start chatting

## Supported AI Providers

| Provider | Auth | Models | Best For |
|----------|------|--------|----------|
| **Vercel AI Gateway** | API Key | 50+ models from all providers | One key for everything |
| **OpenAI** | API Key | GPT-4o, o1, o3 | General tasks |
| **Anthropic** | API Key | Claude Opus, Sonnet, Haiku | Reasoning, coding |
| **Google** | API Key | Gemini 2.5 Pro & Flash | Multimodal, large context |
| **Mistral** | API Key | Mistral Large, Codestral | Fast European models |
| **Ollama Cloud** | API Key ($20-100/mo) | DeepSeek 671B, Qwen 480B | Large open-source models |
| **Ollama (Local)** | None | Llama, Mistral, CodeLlama | Free, private, offline |

## Tech Stack

- **Electron** + **React 19** + **TypeScript** — Cross-platform desktop app
- **Tailwind CSS v4** — Custom dark design system
- **Zustand** — Lightweight state management
- **Vite** — Fast builds and HMR

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # App entry, IPC handlers
│   ├── store.ts       # Persistent JSON store
│   ├── types.ts       # Shared type definitions
│   └── agent-manager.ts
├── preload/           # Secure IPC bridge
│   └── index.ts
└── renderer/          # React frontend
    └── src/
        ├── components/
        │   ├── ui/          # Card, Button, Input, Badge, Switch
        │   ├── layout/      # Sidebar with company switcher
        │   ├── dashboard/   # Stats, quick actions, team overview
        │   ├── employees/   # Employee management, editor, permissions
        │   ├── chat/        # Conversation interface
        │   ├── knowledge/   # Document management
        │   └── settings/    # Provider configuration
        ├── stores/          # Zustand state
        └── lib/             # Utilities, mock API
```

## Comparison

| Feature | Prometheus | Claude Projects | OpenClaw | ChatGPT |
|---------|-----------|----------------|----------|---------|
| Multiple AI providers | 7 providers, 50+ models | Anthropic only | Multi-provider | OpenAI only |
| Named AI agents with roles | Yes | No | Partial | Custom GPTs (limited) |
| Shared knowledge base | Yes | Project docs | No | No |
| Inter-agent communication | Yes | No | No | No |
| Desktop app | Yes | Web only | Web + CLI | Web + app |
| Local/offline models | Yes (Ollama) | No | No | No |
| Granular permissions | Per-employee | Per-project | No | No |
| Department organization | Yes | No | No | No |
| Data stays local | Yes | Cloud | Cloud | Cloud |
| Setup complexity | Install + run | Sign up | Complex CLI setup | Sign up |
| Open source | Yes (MIT) | No | Yes | No |

## License

MIT
