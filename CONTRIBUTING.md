# Contributing to Prometheus

Thanks for your interest in contributing to Prometheus! Here's how to get started.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/davidmoserai/prometheus.git
cd prometheus

# Install dependencies
npm install

# Run in browser (no Electron needed)
npm run dev:web

# Run as desktop app (from Terminal.app, not VS Code terminal)
npm run dev

# Build the desktop app
npm run build
npm run pack
```

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # App entry, IPC handlers
│   ├── store.ts       # JSON persistence layer
│   ├── types.ts       # Shared type definitions
│   └── agent-manager.ts  # LLM integration (streaming, tool calling, caching)
├── preload/           # Secure IPC bridge
│   └── index.ts
└── renderer/          # React frontend
    └── src/
        ├── components/
        │   ├── ui/         # Shared primitives (Card, Button, Input, etc.)
        │   ├── layout/     # Sidebar, navigation
        │   ├── dashboard/  # Overview stats
        │   ├── employees/  # Employee management
        │   ├── chat/       # Conversation interface
        │   ├── tasks/      # Inter-agent task delegation
        │   ├── knowledge/  # Document management
        │   └── settings/   # Provider configuration
        ├── stores/         # Zustand state management
        └── lib/            # Utilities, mock API
```

## Development Notes

### Web Preview vs Desktop

- `npm run dev:web` — runs in the browser with a mock API. Best for UI work.
- `npm run dev` — runs the full Electron app. Must be run from **Terminal.app**, not VS Code's integrated terminal (the `ELECTRON_RUN_AS_NODE` env var breaks Electron).

### Known Tailwind CSS v4 Issue

Tailwind spacing utilities (`p-7`, `mb-5`, `gap-6`) don't render at correct sizes in this project. **Use inline `style={{ }}` for all spacing** (padding, margin, gap). Keep Tailwind for colors, borders, typography, flex/grid, transitions, and rounded corners.

### Design System

- **Dark-only** — no light mode
- **Colors**: Use semantic tokens (`bg-bg-primary`, `bg-bg-elevated`, `border-border-default`, etc.) defined in `globals.css`
- **Spacing**: Inline styles — 48px page padding, 28px card padding, 24px grid gaps
- **Cards/surfaces**: `bg-bg-elevated` with `border-border-default`
- **Dropdowns**: Solid `backgroundColor` via inline style (not Tailwind class)

### Adding a New Provider

1. Add to `DEFAULT_PROVIDERS` in `src/main/types.ts`
2. Add to mock data in `src/renderer/src/lib/mock-api.ts`
3. Add to `PROVIDER_INFO` in `src/renderer/src/components/settings/settings-page.tsx`
4. If the API format differs from OpenAI, add a new method in `src/main/agent-manager.ts`

### Adding a New Page

1. Create component in `src/renderer/src/components/{page}/`
2. Add route case in `src/renderer/src/App.tsx`
3. Add nav item in `src/renderer/src/components/layout/sidebar.tsx`
4. Add view type to `activeView` in `src/renderer/src/stores/app-store.ts`

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Test in both web preview (`npm run dev:web`) and desktop app (`npm run dev`)
4. Run `npm run typecheck` to verify no TypeScript errors
5. Write a clear PR description explaining what and why
6. Submit the PR

## Code Style

- TypeScript strict mode — proper types, avoid `any`
- React function components only
- Concise comments above logical blocks, not every line
- Keep components under 200 lines
- No inline styles for colors/borders (use Tailwind), but yes for spacing (see known issue above)

## Reporting Issues

- Use the GitHub issue templates (Bug Report or Feature Request)
- Include screenshots for UI issues
- Include your OS, Electron version, and provider being used

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
