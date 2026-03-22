# Prometheus — Build AI Agent Teams That Actually Work Together

**The open-source alternative to Claude Projects, ChatGPT, and OpenClaw.** Create AI agent teams with roles, shared knowledge, task delegation, and multi-provider support — all in a single desktop app.

Prometheus is an AI agent platform for founders, operators, and power users who need more than a chatbot. Build specialized AI teams where each agent has a defined role, tools, and context — and they can delegate work to each other using structured task briefs.

Think of it as **Claude Projects on steroids**: multiple providers, inter-agent collaboration, recurring tasks, tool execution, and your data never leaves your machine.

## Why Prometheus?

### The Problem

**Claude Projects** gives you one provider, no agent-to-agent communication, and no task delegation. You're re-explaining context every conversation.

**OpenClaw** is powerful but requires terminal setup, CLI commands, and technical knowledge. Not built for non-developers.

**ChatGPT and Gemini** are single-agent chatbots. No teams, no shared knowledge, no collaboration.

### The Solution

Prometheus lets you build **AI agent teams** — not just chat with one model. Each agent is a specialized team member:

- **Researcher** — searches the web, analyzes data, produces reports
- **Writer** — creates content in your brand voice using your knowledge base
- **Developer** — writes code, reads files, executes scripts
- **Your custom roles** — any specialization you need

Agents collaborate through structured **Agent Briefs** — when one agent needs help, they delegate with a clear objective, deliverable, and acceptance criteria. The receiving agent works autonomously and delivers results to your Tasks dashboard.

## Key Features

### AI Agent Management
- **Named agents with roles** — each agent has a personality, system prompt, and specialization
- **Employee templates** — start with Researcher, Writer, or Developer presets
- **Departments** — organize agents into teams (Engineering, Creative, Research)
- **Multi-company** — manage separate organizations with isolated data

### Inter-Agent Collaboration
- **Task delegation** — agents assign work to each other using structured briefs
- **Auto-execution** — delegated tasks run automatically in the background
- **Contact access control** — define which agents can communicate with each other
- **Task tracking** — monitor pending, in-progress, completed, and escalated tasks

### Recurring Tasks & Automation
- **Scheduled tasks** — hourly, daily, or weekly automated agent work
- **Background execution** — tasks run when the app is open
- **Catch-up on missed runs** — executes overdue tasks when you launch the app

### Knowledge Management
- **Shared knowledge base** — markdown documents injected with every agent message
- **Living vs Reference docs** — mark documents as frequently changing or stable
- **Review reminders** — get prompted when documents are overdue for verification
- **Context stays current** — agents always work with your latest business context

### Tool Execution
- **Web Search** — agents can search the web for real-time information
- **Web Browse** — read and extract content from URLs
- **Read Files** — access your local filesystem
- **Write Files** — create documents, downloadable from the chat
- **Execute Code** — run code in a sandboxed environment
- **Per-tool approval** — require your confirmation before execution

### Multi-Provider Support (7 Providers, 50+ Models)

| Provider | Models | Best For |
|----------|--------|----------|
| **Vercel AI Gateway** | Claude, GPT, Gemini, Grok, DeepSeek, Llama, Qwen, 50+ more | One API key for everything |
| **OpenAI** | GPT-4o, o1, o3 | General tasks |
| **Anthropic** | Claude Opus, Sonnet, Haiku | Reasoning, coding |
| **Google** | Gemini 2.5 Pro & Flash | Multimodal, large context |
| **Mistral** | Mistral Large, Codestral | Fast, EU-based |
| **Ollama Cloud** | DeepSeek 671B, Qwen 480B | Subscription-based open-source |
| **Ollama Local** | Llama, Mistral, CodeLlama | Free, private, offline |

### Privacy & Performance
- **100% local data** — all data stored on your machine, never sent to third parties
- **Zero Data Retention** — native ZDR via Vercel AI Gateway
- **Prompt caching** — automatic caching for Anthropic, OpenAI, Vercel AI Gateway, Ollama
- **Token counting** — real-time token usage display
- **Conversation compression** — summarize long conversations to save context window
- **Streaming** — real-time response streaming for all providers

### Desktop Experience
- **Native macOS app** — Electron with custom dark design system
- **Notifications** — native + in-app alerts for completed/escalated tasks
- **Onboarding** — guided setup for first-time users
- **Auto-update** — automatic updates via GitHub Releases

## Getting Started

```bash
# Install dependencies
npm install

# Run the desktop app (from Terminal.app, not VS Code)
npm run dev

# Or preview in browser
npm run dev:web

# Build for production
npm run build && npm run pack
```

1. Open the app → follow the onboarding guide
2. Go to **Settings** → add your API key
3. **Hire** your first agent (try a template!)
4. Start chatting and delegating

## Comparison

| Feature | Prometheus | Claude Projects | OpenClaw | ChatGPT |
|---------|-----------|----------------|----------|---------|
| Multiple AI providers | 7 providers, 50+ models | Anthropic only | Multi-provider | OpenAI only |
| AI agent teams with roles | Yes | No | Partial | Custom GPTs (limited) |
| Inter-agent task delegation | Yes | No | No | No |
| Recurring scheduled tasks | Yes | No | No | No |
| Shared knowledge base | Yes | Project docs | No | No |
| Tool execution (web, files, code) | Yes | Limited | Varies | Plugins |
| Desktop app | Yes | Web only | Web + CLI | Web + app |
| Local/offline models | Yes (Ollama) | No | No | No |
| Data stays local | Yes | Cloud | Cloud | Cloud |
| Zero data retention | Yes (Vercel ZDR) | No | No | No |
| Context management | Living/reference docs | No | No | No |
| Notifications | Native + in-app | No | No | No |
| Open source | Yes (MIT) | No | Yes | No |
| Setup complexity | Install + run | Sign up | Complex CLI | Sign up |

## Tech Stack

- **Electron 35** + **React 19** + **TypeScript** — cross-platform desktop app
- **Tailwind CSS v4** — custom dark design system
- **Zustand** — lightweight state management
- **Vite 8** — fast builds and HMR
- **electron-updater** — auto-update infrastructure

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

MIT
