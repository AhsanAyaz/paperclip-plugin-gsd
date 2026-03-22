# @codewithahsan/paperclip-plugin-gsd

GSD (Get Shit Done) plugin for [Paperclip](https://github.com/paperclipai/paperclip). Bridges GSD planning workflows with Paperclip by syncing phases, milestones, and progress from agent workspaces into Paperclip's UI and issue tracker.

## What it does

- **Reads GSD `.planning/` directories** from project workspaces and syncs state into Paperclip
- **Tracks phase lifecycle** — from context gathering through research, planning, execution, verification, and completion
- **Auto-syncs** on configurable intervals and on agent run completion
- **Surfaces progress** via dashboard widgets, project detail tabs, issue tabs, and toolbar buttons
- **Links phases to issues** — progress updates are posted as comments on linked Paperclip issues
- **Adapter awareness** — shows which agents support GSD (Claude Code, Gemini CLI, etc.)

## Requirements

- [Paperclip](https://github.com/paperclipai/paperclip) instance
- [GSD](https://github.com/get-shit-done/get-shit-done) installed in your agent's environment (Claude Code plugin, Gemini CLI skill, etc.)

> This plugin does NOT reimplement GSD. It reads the state that GSD produces and surfaces it in Paperclip's UI.

## Install

```bash
npx paperclipai plugin install @codewithahsan/paperclip-plugin-gsd
```

Or install from a local path:

```bash
npx paperclipai plugin install ./path/to/paperclip-plugin-gsd
```

## UI Components

| Slot | Description |
|------|-------------|
| **Dashboard Widget** | Overview of GSD progress across all projects |
| **Project Tab** | Detailed phase roadmap with progress bars and artifact badges |
| **Issue Tab** | Phase details for issues linked to GSD phases |
| **Sync Button** | Manual sync trigger on project toolbar |
| **Settings Page** | Auto-sync toggle, interval config, agent compatibility |

## Phase Status Detection

The plugin detects phase status from the filesystem — no configuration needed:

| Status | Meaning |
|--------|---------|
| Not Started | Phase directory exists but is empty |
| Context Gathered | `CONTEXT.md` present |
| Researched | `RESEARCH.md` present |
| Planned | `PLAN.md` files exist, none executed |
| Executing | Some plans have `SUMMARY.md` |
| Finishing | All plans done, still current phase (verification/UAT running) |
| Verifying | Verification found gaps or needs human review |
| Complete | All plans done, verification passed |
| Gaps Found | UAT diagnosed issues |

## Configuration

Settings are available in the plugin's settings page within Paperclip:

- **Auto-sync enabled** — periodically sync GSD state (default: `true`)
- **Sync interval** — how often to check for changes, 10–600 seconds (default: `30`)

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
