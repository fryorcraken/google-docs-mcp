# Tools

This directory contains all MCP tool definitions for the Google Docs, Sheets, Drive, Gmail, and Calendar server. Tools are organized into domain-specific folders, each with its own router (`index.ts`) that registers its tools with the server.

## Architecture

```
tools/
├── index.ts       # Top-level router — delegates to each domain
├── docs/          # Google Docs API operations
├── drive/         # Google Drive file and folder management
├── sheets/        # Google Sheets operations
├── gmail/         # Gmail message and label operations
├── calendar/      # Google Calendar event operations
└── utils/         # Cross-cutting workflow utilities
```

Each domain folder contains:

- **`index.ts`** — A router that registers all tools in the domain
- **`README.md`** — Documentation of the domain and its tools
- **Individual tool files** — One file per tool, each exporting a `register(server)` function

## Domains

| Domain                  | Tools | Description                                                      |
| ----------------------- | ----: | ---------------------------------------------------------------- |
| [docs](./docs/)         |    14 | Read, write, format, and comment on Google Documents             |
| [drive](./drive/)       |    12 | Search, create, move, copy, rename, and delete files and folders |
| [sheets](./sheets/)     |    11 | Read, write, append, format, validate, and manage spreadsheets   |
| [gmail](./gmail/)       |    13 | Read, send, draft, label, trash, and triage Gmail messages       |
| [calendar](./calendar/) |     5 | List, create, update, delete, and quick-add Calendar events      |
| [utils](./utils/)       |     2 | Markdown conversion and other cross-cutting workflows            |

## Adding a New Tool

1. Create a new file in the appropriate domain folder (e.g., `docs/myNewTool.ts`)
2. Export a `register(server: FastMCP)` function that calls `server.addTool({...})`
3. Import and call it from the domain's `index.ts` router
