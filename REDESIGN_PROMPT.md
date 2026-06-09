# ForgeOS UI Redesign — Coding Agent Brief

> Paste this entire file as the **first message** to Codex / Claude Code / Cursor Agent.
> The repo is already cloned at the agent's working directory. Treat this as the spec; do not re-invent it.

---

## 0. Role and tone

You are a **senior product engineer + product designer** redesigning the ForgeOS web UI from the ground up. Optimise for: visual restraint, structural clarity, fast time-to-first-token rendering, and human-in-the-loop trust signals. Ship working code in small, reviewable chunks. Do not narrate every step — work the plan, commit each milestone, and post a short delta at the end of each day-block.

## 1. Mission (1 sentence)

Rebuild the ForgeOS frontend into a 2026-era agentic operations console — single chromatic accent, Linear-grade restraint, a spatial agent canvas instead of vertical log scrolls, plan-as-object review, and a streaming-UI discipline that matches the reading-speed-cadence of the LLMs behind it.

## 2. Context — what exists today

**Stack:** React 18, Vite 5, Tailwind 3 (legacy `tailwind.config.js`), framer-motion, lucide-react, @monaco-editor/react, @xterm/xterm, @mlc-ai/web-llm. No router. No design tokens.

**Backend (DO NOT BREAK):** FastAPI at `backend/app/main.py`. Key endpoints to preserve verbatim:
- `GET/POST /api/demands`, `GET /api/demands/{public_id}`, `POST /api/demands/{public_id}/approve`
- `GET/PUT/POST/DELETE /api/projects/{public_id}/files[...]`, `POST /api/projects/{public_id}/server/{start|stop|restart|status}`
- `GET/PUT /api/settings`, `GET /api/settings/llm/{models,routing}`
- WebSocket at `ws://.../ws` emitting events typed in `frontend/src/types/index.ts` (`WSEvent` union — `pipeline.*`, `agent.code`, `agent.log`, `agent.complete`, `pipeline.completed`, `pipeline.error`). Keep the consumer contract intact.

**Files to read BEFORE touching anything** (in order):
1. `frontend/package.json` — current deps
2. `frontend/src/types/index.ts` — domain types and the `WSEvent` union (this is the API contract you must honour)
3. `frontend/src/services/forgeApi.ts` — REST client surface
4. `frontend/src/hooks/useWebSocket.ts` — already handles React-StrictMode double-mount correctly; do not regress it
5. `frontend/src/App.tsx` — current view router (will be replaced)
6. `frontend/src/pages/Demand.tsx` — 1,220 lines, the biggest thing to break apart
7. `frontend/src/pages/Pipeline.tsx` — the most under-designed but highest-value page
8. `frontend/src/pages/Demands.tsx` — list view
9. `frontend/src/pages/RolePortal.tsx` — 101 KB, will be slimmed dramatically
10. `frontend/src/components/AgentFactoryScene.tsx` — KEEP the doodle agents, they become canvas nodes
11. `frontend/src/components/ide/IDELayout.tsx` and all of `frontend/src/components/ide/*` — IDE shell to be wrapped as a tab
12. `frontend/src/components/LiveCodePanel.tsx` — needs streaming-discipline retrofit
13. `frontend/src/components/SettingsPanel.tsx` and `SmartRoutingPanel.tsx` — Settings stays as a sheet
14. `frontend/src/index.css` — tokens go here under `@theme`

## 3. Hard constraints

1. **Do not change the backend.** All API shapes and the `WSEvent` union are frozen.
2. **Do not break existing project artefacts.** The IDE must still load `/api/projects/:id/files`, edit, and trigger preview restart on save.
3. **Keep Monaco semantic-diagnostics disabled** (see `CodeEditor.tsx`) — pre-existing fix.
4. **Keep the React-StrictMode-safe WebSocket logic** in `useWebSocket.ts`. Treat it as load-bearing.
5. **No breaking changes to URL stability** for the IDE preview proxy paths.
6. **Single chromatic accent only.** Forge ember `#F2762A`. Emerald, cyan, violet, amber, rose, sky are demoted to semantic-only (success / warn / danger). If you find yourself reaching for a 5th colour, you're wrong.
7. **Light mode must work** from day 1 (token swap on `:root` / `[data-theme="light"]`).
8. **Mobile breakpoint sm (640px) must be usable** — nothing below xl can stay required.

## 4. Decisions already locked

- **Scope:** full redesign (Tailwind v4 + shadcn/ui + React Router + agentic canvas)
- **Accent:** Forge ember `#F2762A` (single chromatic)
- **IDE placement:** as a TAB inside the demand page (`/demand/:id` → tabs `Plan · Agents · Files · Preview · Terminal`). No standalone `/ide` route.

## 5. Design system — `DESIGN.md`

Create `frontend/DESIGN.md` with this content verbatim and treat it as canon for every component:

```md
# ForgeOS Operator — Design System v1

## Palette (dark canvas default)
canvas       #07070A
surface-1    #0E0E12   (cards)
surface-2    #15151B   (hover / lifted)
surface-3    #1B1B22   (popovers, dialogs)
hairline     #26262E
hairline-hi  #33333D
fg-strong    #F4F4F6
fg           #C7C7CC
fg-muted     #8A8A93
fg-faint     #5C5C66

accent       #F2762A   ("Forge ember" — single chromatic)
accent-soft  #2B1A10   (10% tint background)
accent-fg    #FFFFFF   (text on accent)

success      #34D399   (completion / OK gates ONLY)
warn         #F5C152
danger       #EF4444
info         #8A8A93   (no chromatic — use fg-muted)

## Palette (light canvas)
canvas       #FAFAF7
surface-1    #FFFFFF
surface-2    #F4F4F0
surface-3    #EEEEE8
hairline     #E5E5DF
hairline-hi  #D4D4CE
fg-strong    #0E0E12
fg           #2A2A30
fg-muted     #5C5C66
fg-faint     #8A8A93
accent       #D85F12   (ember, darkened for contrast)
accent-soft  #FDEFE3

## Typography
display  "Geist", "Inter", system-ui; tracking -0.02em; weights 500/600
body     "Inter", system-ui; tracking -0.005em; weights 400/500
mono     "JetBrains Mono", ui-monospace; weight 450

Scale (px / line-height):
display-xl  48 / 52   (page hero, never more than one per page)
display-lg  32 / 36
h1          24 / 30
h2          18 / 24
body-lg     15 / 22
body        14 / 20   (default)
caption     12 / 16
micro       11 / 14   (uppercase tracking 0.06em — used SPARINGLY, never for >3 words)

## Radii
4 / 8 / 12 / 20 / pill (full)

## Spacing (4px base)
1 / 2 / 3 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 48 / 64

## Shadows
one shadow, applied ONLY to popovers / dialogs / floating panels:
  0 1px 0 hsla(0,0%,100%,0.04) inset,
  0 12px 24px -16px rgba(0,0,0,0.6)
no other elements get shadows.

## Motion
ease-out-soft   cubic-bezier(.2,.8,.2,1)
ease-in-soft    cubic-bezier(.4,.0,.6,1)
duration-fast   140ms (hover, focus)
duration-base   220ms (page transitions, sheet open)
duration-slow   420ms (artifact materialisation, completion ping)
no parallax. no spring overshoot except on small icons (≤24px).

## Component rules
- Cards: surface-1, hairline border, radius 12, no shadow.
- Hover state on interactive cards: surface-2 + hairline-hi.
- Primary button: accent bg, accent-fg text, radius 8, height 36.
- Secondary button: transparent bg, hairline border, fg text.
- Destructive button: danger bg, white text (same shape).
- Inputs: surface-1 bg, hairline border, focus ring = accent at 35% alpha 2px.
- Pills: caption type, surface-2 bg, hairline border, radius pill.
- Skeletons: surface-2 with a 1500ms shimmer (linear-gradient sweep).
- Sonner toasts: surface-3 bg, hairline-hi border, accent left-stripe 2px.

## Iconography
lucide-react only. Stroke-width 1.5 (NOT default 2). Icon size matches text line-height — 14 for body, 16 for h2, 18 for h1.

## Don'ts
- No second chromatic accent.
- No emojis in product chrome (OK inside agent-generated content).
- No animated gradients.
- No glass / backdrop-blur except on the command palette and the sheet header (subtle, 16px).
- No uppercase headings longer than 3 words.
- No font weight 700 or 800 — display caps at 600.
```

## 6. Tech swap

Run these once:

```bash
cd frontend

# Tailwind v4 + the Vite plugin (CSS-first config in index.css)
npm i -D tailwindcss@^4 @tailwindcss/vite

# Routing + UI primitives
npm i react-router-dom@^6 cmdk sonner
npm i @xyflow/react        # spatial agent canvas
npm i clsx tailwind-merge  # if not already
npm i class-variance-authority

# shadcn/ui — manual setup (do NOT use a non-existent CLI flag if it errors)
# Add components.json and copy primitives: Button, Card, Sheet, Dialog,
# Tabs, Tooltip, Accordion, Command, DropdownMenu, ScrollArea, Skeleton,
# Toggle, Switch, Progress, Separator, Avatar, Badge.

# Remove the old config once @theme is live:
# rm tailwind.config.js postcss.config.js
```

Update `frontend/vite.config.ts` to use `@tailwindcss/vite`. Move all tokens from §5 into `frontend/src/index.css` under `@theme` and `@layer base`. Light-mode tokens live under `[data-theme="light"]`.

## 7. Information architecture

```
URL                                  Page
────────────────────────────────────  ────────────────────────────────────────
/                                    Redirect → /demands
/demands                             Network view (kanban by stage)
/demand/new                          Intake wizard (3 steps)
/demand/:id                          Demand workspace — Tabs:
  /demand/:id/plan       (default)   Plan card + HITL gates
  /demand/:id/agents                 Agentic canvas (React Flow)
  /demand/:id/files                  IDE — file tree + Monaco
  /demand/:id/preview                Live preview iframe
  /demand/:id/terminal               xterm + agent log stream
/models                              Smart router matrix + model catalog
/settings                            Settings (sheet on every page; this is the deep-link)
```

**App shell** (`src/layouts/AppShell.tsx`):
- Left rail (64px collapsed, 220px expanded) with: Demands · Models · Settings + collapse toggle at bottom
- Top breadcrumb bar with: home crumb → demand name → tab name + command palette trigger `⌘K` on the right
- ⌘K opens `cmdk` with: navigate to demand, new demand, switch model, toggle theme, open IDE for demand, recent demands.

## 8. The 14-day plan (commit-by-commit)

Treat each block as one PR-sized commit. After each, run `npm run build` and `npm run dev`, smoke-test, and post a 3-line delta in the chat.

### Day 1 — Foundations
- Add `frontend/DESIGN.md`
- Install Tailwind v4 + plugin, move tokens into `index.css` under `@theme`
- Wire `[data-theme="light"]` and a `<ThemeToggle/>` (default dark, persist to localStorage)
- Replace global `body` font and `::selection`
- **Acceptance:** existing pages still render (degraded), tokens applied, theme toggle works.

### Day 2 — Primitives
- Add `components/ui/` shadcn primitives listed in §6
- Add `lib/cn.ts` (`twMerge(clsx(...))`)
- Rewrite the existing `icon-btn` and `input-dark` utilities as variants on Button / Input
- **Acceptance:** Storybook-style sandbox route `/dev/primitives` renders all primitives in both themes.

### Day 3 — App shell + router
- `react-router-dom` v6 with routes from §7
- `AppShell` with left rail + breadcrumbs + ⌘K
- Sonner mounted at root for global toasts
- Migrate the boot splash to a route guard, not a state flag
- **Acceptance:** every existing screen reachable by URL, deep-linkable, back button works.

### Day 4-5 — `/demands` board (network view)
- Kanban by stage (Ingested · Understanding · Deciding · Allocating · Awaiting approval · Executing · Monitoring · Completed · Failed)
- Each card: demand id (mono), one-line raw_text, age, owner avatar, current agent, token spend (mono), stage chip
- Filter chips at top: priority, industry, stage, mine
- Empty state: illustrated "forge is cold" + 3 starter-prompt chips that route to `/demand/new?seed=...`
- Skeleton on load (shimmer)
- **Acceptance:** drag NOT required; column header counts live-update from WebSocket; click card → `/demand/:id/plan`.

### Day 6-7 — `/demand/new` intake wizard
Replace the 1,220-line `Demand.tsx` with 3 steps inside a single Sheet (or full page; pick what feels better at 1024px).

**Step 1 — What.** Big textarea (auto-grow, mono optional), 4 chip groups for Industry / Priority / Timeline / Budget. `Cmd+Enter` submits. Char count + 3 LLM-suggested starter prompts (call `/api/demands/suggest` if it exists; otherwise hard-code 3 examples).

**Step 2 — Plan review.** Render the `understanding + decision + allocation` payload as ONE editable plan card. Each row inline-editable (problem type, domain, complexity, urgency, scope days, risk factors, team members, cost). Secondary detail (rebalance signals, reuse candidates) goes into an Accordion that's collapsed by default. The original 30 cards become at most 6 visible blocks.

**Step 3 — Approve & launch.** HITL gate component (see §10). Cost in USD + token estimate + agent fleet size + 2 s cooldown + word-typed "launch" confirm only if `decision.execution_mode === "human_team"` or `risk_factors.length >= 3`; otherwise just the cooldown.

- Preserve the local-fallback path (`buildLocalPlan`) for offline.
- **Acceptance:** can submit a demand and reach `/demand/:id/plan` with the plan visible.

### Day 8-10 — Agentic canvas (`/demand/:id/agents`)
This is the centrepiece. Replace the vertical pipeline with `@xyflow/react`.

- **Nodes:** one per role (PM, FE, BE, DevOps, QA, Docs). Node component renders the existing `AgentFactoryScene` doodle scaled to ~120×140, plus: role label, current task (truncated), progress bar, model badge (from `agent.code` events), token meter.
- **Edges:** static graph PM → (FE, BE) → QA → Docs → DevOps. Animate the edge dash when an `agent.code` chunk for the source node is flowing.
- **Selected agent panel** (bottom, resizable, default 320px): live token stream (markdown-rendered, 40 ms buffered — see §11), tool calls table, artefacts list. Buttons: `Stop`, `Edit prompt`, `Pin artefact`.
- **Verbosity slider** (1–10) in the canvas toolbar; changes how much of `agent.log` is rendered.
- **Plan card** is sticky on the left (collapsible to a vertical strip) so the user never loses the "where are we" mental model.
- Stage progress bar (the existing 9-step list) becomes a single horizontal rail at the top.
- **Acceptance:** running a fresh demand shows nodes lighting up live; clicking a node reveals its stream; stopping mid-stream works.

### Day 11 — Streaming discipline pass
Apply to the canvas's selected-agent panel AND any markdown surface.

- In `useWebSocket.ts`, add a 40 ms debounce that **batches deltas per `(demand_id, agent_name)`** and flushes them as a single state update.
- In the rendering component, use `content-visibility: auto` on the scroller; preallocate a code block frame as soon as we see ` ``` ` open.
- Render markdown progressively (use `react-markdown` already in deps; no waiting for fence close).
- Persistent floating `[ Stop ]` button — never inside the stream itself.
- Completion = a 420 ms scale-in on an "Artifact ready" card with `Open in Files / Open in Preview / Download` actions; the stream pane fades to read-only.
- **Acceptance:** at 80 tokens/s the page never scrolls jitter; `Stop` interrupts within 150 ms.

### Day 12 — HITL `Gate` component
A single `<Gate>` primitive with three modes; reuse everywhere:

```ts
type GateMode =
  | { kind: "inline" }                                              // low risk
  | { kind: "modal"; title: string; summary: string }               // medium
  | { kind: "max"; title: string; endpoint: string; payload: any;
      blastRadius: string; cooldownMs?: 3000;                        // high
      requireTyped?: string }                                        // e.g. "deploy"
```

Use cases:
- `inline`: approve a draft plan tweak
- `modal`: approve & launch a normal demand
- `max`: deploy to production, delete a demand, wipe artefacts

- **Acceptance:** the intake wizard's Step 3 uses `modal`, the Demand list's "delete" uses `max` with `requireTyped="delete"`.

### Day 13 — Empty / skeleton / error / toast
- Shimmer skeletons for every list, card, and panel (`<Skeleton/>`)
- Friendly empty states with one CTA each (no "loading...")
- Error boundary at AppShell + per-route boundaries; "explain this error" button uses `forgeApi` to re-prompt
- All transient feedback via Sonner (saved, started, deleted, copied)
- **Acceptance:** disconnect WebSocket → see a non-alarming "Reconnecting…" toast, not a red page.

### Day 14 — Polish + keyboard
- ⌘K commands: `Go to demands`, `New demand`, `Open IDE for {id}`, `Toggle theme`, `Open Models`, `Open Settings`
- Single-letter shortcuts: `g d` → demands, `g p` → current pipeline, `e` → edit prompt in canvas, `?` → shortcut sheet
- Audit motion: every transition uses tokens from §5
- Audit a11y: keyboard reach every interactive element, `aria-live="polite"` on streaming text, focus rings visible
- Lighthouse: ≥ 95 perf / 100 a11y on `/demands` at default project

## 9. Files you can DELETE after migration

Only after the equivalent functionality is live in the new tree:

- `frontend/src/pages/Demand.tsx` → replaced by `routes/demand/new/`
- `frontend/src/pages/Demands.tsx` → replaced by `routes/demands/index.tsx`
- `frontend/src/pages/Pipeline.tsx` → replaced by `routes/demand/[id]/agents.tsx`
- `frontend/src/pages/RolePortal.tsx` → trim to <300 lines, move pieces to home / docs
- `frontend/src/components/GenerationPanel.tsx`, `BrowserModelPanel.tsx`, `LogPanel.tsx`, `ProjectOutput.tsx`, `PromptInput.tsx`, `Dashboard.tsx`, `AgentScene.tsx`, `AgentCard.tsx`, `Header.tsx` — verify each is unused, then delete.
- KEEP: `AgentFactoryScene.tsx`, `LiveCodePanel.tsx` (refactored), `SettingsPanel.tsx`, `SmartRoutingPanel.tsx`, `BootSplash.tsx`, every file under `components/ide/`.

## 10. Quality bar (apply continuously)

1. **Token cleanliness:** zero hardcoded hex in TSX. If you write `bg-slate-900`, you owe yourself an apology. Use `bg-surface-1` / `text-fg-muted` / `border-hairline` — semantic only.
2. **Single accent rule:** grep for `cyan|violet|amber|rose|sky|emerald` in `.tsx`/`.css` after Day 7. Each remaining instance must be justified as `success`/`warn`/`danger`.
3. **Streaming discipline (§11 below)** applies to anything that prints LLM output.
4. **Keyboard-first:** every interactive element reachable via Tab; focus rings always visible; Esc closes any overlay.
5. **A11y:** all icons that carry meaning have `aria-label`; all live regions have `aria-live="polite"`; contrast ≥ 4.5:1 against background tokens.
6. **No layout thrash during streams:** measure with DevTools Performance — long tasks > 50 ms during streaming = bug.
7. **Mobile:** `/demands` and `/demand/:id/plan` usable at 390 px; canvas and IDE may show a "best on tablet+" notice on small screens.

## 11. Streaming-UI implementation notes

The agent canvas's selected-pane is the hottest surface. Implement it like this:

```ts
// useStreamBuffer.ts — flush deltas at most every 40ms.
function useStreamBuffer<T>(onFlush: (batch: T[]) => void, ms = 40) {
  const queue = useRef<T[]>([]);
  const t = useRef<number | null>(null);
  return useCallback((item: T) => {
    queue.current.push(item);
    if (t.current != null) return;
    t.current = window.setTimeout(() => {
      onFlush(queue.current);
      queue.current = [];
      t.current = null;
    }, ms);
  }, [onFlush, ms]);
}
```

Wire it inside the canvas's pane (not globally in `useWebSocket` — that hook stays generic). The pane's reducer collapses a batch of `agent.code` deltas into one string concat per render.

Markdown rendering: `react-markdown` with `remark-gfm` + a code-block component that uses `prism-react-renderer` lazy-loaded for the project's languages only. **Do not** call `setState` per token.

## 12. References (read these once if you want background)

- Linear 2026 refresh: https://linear.app/now/behind-the-latest-design-refresh
- Linear DESIGN.md token reference: https://www.shadcn.io/design/linear
- "Designing Streaming UIs" (Brainy Papers): https://brainy.ink/paper/designing-streaming-uis
- "Agentic UI 2026 Technical Manual": https://interconnectd.com/forum/thread/113/the-agentic-ui-designing-frontends-for-multi-agent-systems-2026-technical-m/
- "Agent UX is not chatbot UX": https://dev.to/victor_desg/agent-ux-is-not-chatbot-ux-and-most-teams-in-2026-ship-them-as-if-they-were-23bi
- Depute component patterns: https://github.com/Iambizi/depute
- Agentic Fabric (React Flow canvas reference): https://github.com/Qredence/agentic-fabric
- AG-UI protocol (event model we already match): https://ai.plainenglish.io/ai-agents-last-mile-ag-ui-the-protocol-that-solves-the-last-mile-problem-for-ai-agents-375be3d63df2

## 13. How to verify each day's work

```bash
# from repo root
./start.sh          # boots backend + frontend + db + redis + minio + opens browser
# then in another shell, while it's running:
cd frontend && npm run build && npm run preview
# poke through:
# - /demands  (kanban + filter + empty + ⌘K)
# - /demand/new  (3 steps + HITL)
# - /demand/:id/agents  (canvas with live deltas — create a demand and watch)
# - /demand/:id/files   (IDE tab)
# - /demand/:id/preview (live vite preview)
# - theme toggle persists
# - keyboard: g d, g p, ⌘K, ?, Esc
```

## 14. When to stop and ask vs. proceed

- **Proceed without asking** for: token names, component naming, file layout under `routes/`, motion timings within the §5 ranges, copy that isn't a destructive action.
- **Stop and ask** for: any backend route change, any change to the `WSEvent` union, removing a screen the user might use, package upgrades that pull in new peer dep ranges, anything that touches `start.sh` / `stop.sh` / `deploy/`.

## 15. Final deliverable

A `feat/redesign-2026` branch with:
- All 14 day-blocks committed in order
- `frontend/DESIGN.md` checked in
- `npm run build` green
- A short `REDESIGN_CHANGES.md` at repo root summarising the swap (1 page max)
- A 60-second screen recording (or 3 screenshots) of the new `/demands`, `/demand/:id/agents`, and IDE tab — embed in the PR description

Now go. Start with Day 1.
