# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is OpenCove

OpenCove is an Electron desktop app — a spatial infinite-canvas workspace for running AI coding agents (Claude Code, Codex), terminals, tasks, and notes side by side. Built with Electron + React + TypeScript via `electron-vite`.

## Essential Commands

```bash
pnpm install          # Install dependencies (Node >= 22, pnpm >= 9)
pnpm dev              # Start dev environment (uses isolated userData dir)
pnpm build            # Build production bundle
pnpm test -- --run    # Run unit/integration/contract tests (Vitest)
pnpm test:e2e         # Run Playwright E2E tests (includes build step)
pnpm pre-commit       # Full quality gate: line-check, secrets, naming, lint, format, types, tests
pnpm lint             # Oxlint
pnpm lint:fix         # Oxlint with autofix
pnpm format:check     # Prettier check
pnpm check            # TypeScript type check (both node + web configs)
```

Before running `pnpm pre-commit`, first `git add` your changes, then run `pnpm line-check:staged` — the line gate (500-line max per file) only checks staged files.

To run a single test file: `pnpm test -- --run tests/unit/foo.test.ts`

To run a single E2E test: `pnpm build && pnpm exec playwright test tests/e2e/foo.spec.ts`

## Architecture

### Process Model (Electron)

Three process boundaries — code must never leak across them:

- **Main** (`src/app/main/`) — Electron main process: lifecycle, IPC server, module assembly
- **Preload** (`src/app/preload/`) — IPC bridge whitelist, context-isolated. Exposes `window.opencoveApi`
- **Renderer** (`src/app/renderer/`) — React UI: components, hooks, Zustand stores, routing, styling

A PTY host worker (`src/platform/process/ptyHost/`) runs terminal sessions in a separate thread.

### Domain-Driven Design (DDD + Clean Architecture)

`src/contexts/` contains ~19 domain contexts (admin, agent, terminal, workspace, space, project, task, settings, etc.). Each context enforces a 4-layer structure:

1. **domain/** — Business rules, invariants, state models. No external dependencies.
2. **application/** — Use cases, orchestration, abstract ports. Depends only on domain.
3. **infrastructure/** — Technical adapters (Electron, PTY, DB, FS, CLI).
4. **presentation/** — `main-ipc/` for IPC handlers, `renderer/` for React components.

`src/shared/` has cross-cutting types, contracts, constants, and errors. `src/platform/` has OS/persistence/process/terminal abstractions.

### Key Libraries

- **Canvas**: `@xyflow/react` — infinite canvas rendering
- **Terminal**: `xterm.js` + `node-pty` — full PTY runtime
- **State**: Zustand stores in renderer
- **DB**: `better-sqlite3` + `drizzle-orm` for persistence, schema migrations via `drizzle-kit`
- **Styling**: TailwindCSS v4 with `cove` design-system prefix (`--cove-*`, `data-cove-*`)
- **AI**: `@anthropic-ai/sdk` for Claude API integration

### Agent Launch Flow

Agents are launched via `window.opencoveApi.agent.launch()` → IPC handler in `agent/presentation/main-ipc/register.ts` → `buildAgentLaunchCommand()` in `agent/infrastructure/cli/AgentCommandFactory.ts` → PTY session spawn. The command factory builds the proper CLI invocation with flags. Do NOT spawn agents by writing commands to bare terminals.

## Mandatory Reading

**Always read `DEVELOPMENT.md` first** for every task — it's the authoritative source for architecture rules, workflows, and execution methods. `AGENTS.md` has the Small vs Large change triage framework and decision gates.

Key doc pointers in `docs/`:
- `ARCHITECTURE.md` — DDD + Clean layering rules
- `RECOVERY_MODEL.md` — state recovery, owner table
- `PERSISTENCE.md` — SQLite schema, migrations
- `DEBUGGING.md` — test failure troubleshooting (read this before debugging test failures)
- `UI_STANDARD.md` — UI specs, theming, tokens

## Code Conventions

- **Naming**: External/protocol/persistence uses `OpenCove`/`opencove` (e.g., `window.opencoveApi`, `OPENCOVE_*`). UI design system uses `cove` prefix.
- **No `any`**: Strict TypeScript. IPC payloads, DTOs, and boundary values must be typed.
- **No system dialogs**: Renderer uses in-app feedback components (`info/warning/error`), never `window.alert/confirm/prompt`.
- **i18n required**: User-visible text in renderer must go through `src/app/renderer/i18n/locales/{en,zh-CN}.ts`.
- **File size limit**: 500 lines max per file (enforced by pre-commit gate).
- **Formatting**: Prettier — no semicolons, single quotes, 100 char width, 2-space indent.

## Change Workflow

1. **Triage**: Classify as Small (localized, low-risk → proceed directly) or Large (new features, refactors, schema changes, cross-module → Spec → Approval → Plan → Approval before coding).
2. **State ownership**: For any change touching persistence/recovery/sync, identify the single owner and source of truth first.
3. **Test by risk layer**: Unit for state/logic, Contract for IPC/boundary, Integration for lifecycle/persistence, E2E for user-visible changes.
4. **Verify**: Small changes → targeted tests. Large/final changes → `pnpm pre-commit`.
5. **Changelog**: User-visible changes get a line in `CHANGELOG.md` under `## [Unreleased]` with PR number, committed separately after the PR is created.
