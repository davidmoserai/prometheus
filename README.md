# Prometheus

**Your personal AI workforce.**

Prometheus lets you create, manage, and orchestrate AI employees that work together — like having your own AI company. Each employee has a name, role, custom instructions, tools, and knowledge, and they can hand off tasks to each other.

## Why I Built This

I use multiple AI assistants for different things (coding, research, writing, etc.) but they can't talk to each other. They don't share context. They can't delegate work. It's like having employees who sit in separate rooms and never communicate.

Prometheus fixes this. Instead of disconnected "projects" or "chats", you have **employees** — AI agents with defined roles, shared knowledge, and the ability to collaborate.

## What It Does

- **Create AI Employees** — Give them a name, role, system prompt, and avatar
- **Assign Tools** — Web search, file access, code execution, GitHub, Slack, and more (via MCP)
- **Shared Knowledge Base** — Write markdown documents that multiple employees can reference
- **Inter-Employee Communication** — One employee can hand off a task to another
- **Multi-Provider Support** — Use OpenAI, Anthropic, Google, Mistral, or run local models with Ollama
- **Permission Control** — Decide what each employee can do autonomously vs. what needs your approval
- **You're Always in Control** — Every action is visible, every conversation is inspectable

## Tech Stack

- **Electron** + **React** + **TypeScript** — Desktop app for macOS
- **Tailwind CSS v4** + custom design system — Prometheus brand (fire-inspired theme)
- **Zustand** — State management
- **Mastra** (planned) — Multi-provider agent orchestration with MCP support

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build
```

## Configuration

1. Open the app and go to **Settings**
2. Enable your preferred AI provider(s)
3. Enter your API key (or enable Ollama for free local models)
4. Go to **Employees** and hire your first team member

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── index.ts    # App entry, IPC handlers
│   ├── store.ts    # Persistent JSON store
│   ├── types.ts    # Shared type definitions
│   └── agent-manager.ts  # LLM agent orchestration
├── preload/        # Context bridge (secure IPC)
│   └── index.ts
└── renderer/       # React frontend
    └── src/
        ├── App.tsx
        ├── globals.css          # Tailwind + Prometheus theme
        ├── components/
        │   ├── ui/              # Shared UI primitives
        │   ├── layout/          # Sidebar, navigation
        │   ├── dashboard/       # Overview & quick actions
        │   ├── employees/       # Create, edit, manage employees
        │   ├── chat/            # Conversation interface
        │   ├── knowledge/       # Document management
        │   └── settings/        # Provider & API key config
        ├── stores/              # Zustand state
        └── lib/                 # Utilities
```

## License

MIT
