# ForgeOS UI Redesign — Complete End-to-End Brief

> Paste this entire file as the **first message** to Codex / Claude Code / Cursor Agent.
> The repo is already at the agent's working directory. This is the only spec; nothing else is implied.
> Execute the whole redesign in one autonomous run. Commit at logical milestones. Open a PR at the end.

---

## 0. Role

You are a **senior product engineer + product designer**. You ship. You don't ask permission for things this brief already answers. You write small, clean diffs, you commit frequently, you keep the build green, and you finish.

## 1. Mission

Rebuild the ForgeOS web frontend into a 2026-era agentic operations console.

End state, in one paragraph: a Linear-restraint dark/light app with a single chromatic accent (Forge ember `#F2762A`), routed by URL, with a **kanban board of demands** as the home, a **3-step intake wizard** that replaces the current 1,220-line form, a **spatial agentic canvas** (React Flow nodes wired to live WebSocket deltas) as the centrepiece, the **IDE embedded as a tab** inside each demand, **HITL gates** for irreversible actions, **streaming-UI discipline** (40 ms batched, structural commit, persistent stop), a **command palette** (`⌘K`), keyboard-first navigation, a11y AA, and Lighthouse ≥ 95 perf / 100 a11y on the demands board.

You will, in one autonomous run:

1. Replace Tailwind 3 with Tailwind v4 + CSS-first `@theme` tokens
2. Install shadcn/ui primitives, react-router-dom v6, cmdk, sonner, @xyflow/react
3. Build the new app shell, routes, and command palette
4. Build the new demands board, intake wizard, demand workspace with five tabs, models page, and settings sheet
5. Refactor `LiveCodePanel` and `useWebSocket` for streaming discipline
6. Add the `<Gate/>` HITL primitive and wire it everywhere destructive
7. Add empty / skeleton / error / toast surfaces everywhere
8. Delete or trim every file made redundant by the rebuild
9. Commit `frontend/DESIGN.md` and a `REDESIGN_CHANGES.md` at repo root
10. Open a PR on a `feat/redesign-2026` branch with the changelog and 3 screenshots

You may decide your own internal ordering as long as the dependency rule holds:

> **tokens → primitives → app shell → pages → polish**

You may NOT skip the streaming-discipline pass before shipping the agent canvas.

## 2. Locked decisions (do not re-litigate)

- **Scope:** full redesign, all 5 pages and the IDE shell.
- **Accent:** Forge ember `#F2762A` (single chromatic).
- **IDE placement:** as a tab inside `/demand/:id`, NOT a standalone route.
- **Theme:** dark default, light mode required, swap via `[data-theme="light"]` on `<html>`.
- **Router:** `react-router-dom` v6, deep-linkable.
- **Component library:** shadcn/ui (copied into `frontend/src/components/ui/`), not a package.
- **Canvas library:** `@xyflow/react` (formerly `react-flow`).
- **No second chromatic accent.** Emerald, cyan, violet, amber, rose, sky are demoted to *semantic only* (success / warn / danger / info-as-muted-grey).
- **No new backend changes.** API and `WSEvent` are frozen.

## 3. Frozen contracts — do not break

### REST endpoints
```
GET    /api/demands
POST   /api/demands
GET    /api/demands/{public_id}
POST   /api/demands/{public_id}/approve
GET    /api/projects/{public_id}/files
GET    /api/projects/{public_id}/files/{path}
PUT    /api/projects/{public_id}/files/{path}
POST   /api/projects/{public_id}/files
DELETE /api/projects/{public_id}/files/{path}
POST   /api/projects/{public_id}/files/rename
GET    /api/projects/{public_id}/server/status
POST   /api/projects/{public_id}/server/{start|stop|restart}
GET    /api/settings
PUT    /api/settings
GET    /api/settings/llm/models
GET    /api/settings/llm/routing
```

### WebSocket
`ws://<host>/ws` — keep the consumer contract in `frontend/src/types/index.ts` (`WSEvent` union). Events: `pipeline.stage`, `pipeline.understanding`, `pipeline.decision`, `pipeline.allocation`, `pipeline.completed`, `pipeline.error`, `agent.code` (with `phase`, `delta`, `seq`, `model`, `provider`, `task`, `total_chunks`, `char_count`), `agent.log`, `agent.complete`. Already StrictMode-safe in `useWebSocket.ts` — preserve that logic.

### Files that are load-bearing
- `frontend/src/hooks/useWebSocket.ts` — reconnect logic is correct; extend, don't rewrite the connection lifecycle.
- `frontend/src/components/ide/CodeEditor.tsx` — Monaco semantic diagnostics intentionally disabled; keep.
- `backend/app/preview/manager.py` and `backend/app/api/projects.py` — preview lifecycle; do not modify.
- `start.sh` / `stop.sh` / `deploy/` — boot scripts; do not modify.

## 4. Read before you touch (in order)

1. `frontend/package.json`
2. `frontend/src/types/index.ts`
3. `frontend/src/services/forgeApi.ts`
4. `frontend/src/hooks/useWebSocket.ts`
5. `frontend/src/App.tsx`
6. `frontend/src/pages/Demand.tsx`
7. `frontend/src/pages/Pipeline.tsx`
8. `frontend/src/pages/Demands.tsx`
9. `frontend/src/pages/RolePortal.tsx`
10. `frontend/src/components/AgentFactoryScene.tsx`
11. `frontend/src/components/ide/IDELayout.tsx`
12. `frontend/src/components/LiveCodePanel.tsx`
13. `frontend/src/components/SettingsPanel.tsx`
14. `frontend/src/components/SmartRoutingPanel.tsx`
15. `frontend/src/index.css`

After reading, post one short summary back ("Read N files, plan is X"), then start executing.

## 5. Design system — commit as `frontend/DESIGN.md`

Create this file verbatim. It is canon for every styling decision.

````md
# ForgeOS Operator — Design System v1

## Tokens

### Dark canvas (default)
canvas       #07070A
surface-1    #0E0E12      (cards, default surface)
surface-2    #15151B      (hover / lifted / hover row)
surface-3    #1B1B22      (popovers, dialogs, command palette)
hairline     #26262E
hairline-hi  #33333D
fg-strong    #F4F4F6
fg           #C7C7CC
fg-muted     #8A8A93
fg-faint     #5C5C66

accent       #F2762A      ("Forge ember" — the single chromatic)
accent-hi    #FF8A45      (hover/active accent)
accent-soft  #2B1A10      (10% tint background)
accent-fg    #FFFFFF      (text on accent)

success      #34D399      (use for completion / OK only)
warn         #F5C152
danger       #EF4444

### Light canvas
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
accent       #D85F12
accent-hi    #B84E08
accent-soft  #FDEFE3
accent-fg    #FFFFFF

## Type

display  "Geist", "Inter", system-ui   — tracking -0.02em, weights 500/600
body     "Inter", system-ui             — tracking -0.005em, weights 400/500
mono     "JetBrains Mono", ui-monospace — weight 450

Scale (px / line-height):
display-xl  48 / 52   one per page max
display-lg  32 / 36
h1          24 / 30
h2          18 / 24
body-lg     15 / 22
body        14 / 20   default
caption     12 / 16
micro       11 / 14   uppercase tracking 0.06em — never longer than 3 words

## Radii    4 / 8 / 12 / 20 / pill
## Spacing  4-px base — 1 2 3 4 6 8 12 16 24 32 48 64

## Shadow (only for floating surfaces — popover, dialog, dropdown, toast)
  0 1px 0 hsla(0,0%,100%,0.04) inset,
  0 12px 24px -16px rgba(0,0,0,0.6)

## Motion
ease-out-soft   cubic-bezier(.2,.8,.2,1)
ease-in-soft    cubic-bezier(.4,.0,.6,1)
duration-fast   140ms   hover, focus
duration-base   220ms   page transition, sheet open, tab switch
duration-slow   420ms   artifact materialisation, completion ping
No parallax. No gradient animation. No spring overshoot except on icons ≤24 px.

## Component rules
Card             surface-1, border hairline, radius 12, no shadow
Card hover       surface-2 + hairline-hi, translateY(-1px) in 140ms
Button primary   accent bg, accent-fg text, radius 8, height 36
Button secondary transparent bg, border hairline, fg-strong text
Button ghost     transparent, fg, hover surface-2
Button destruct  danger bg, white text
Input            surface-1, border hairline, focus ring 2px accent at 35% alpha
Pill             caption, surface-2, border hairline, radius pill
Skeleton         surface-2 + 1500ms linear-gradient shimmer
Sonner toast     surface-3 bg, hairline-hi border, 2px accent left-stripe
Tabs             underline-style, accent bar 2px below active tab

## Iconography
lucide-react only. Stroke 1.5. Icon size matches text line-height — 14 / 16 / 18.

## Forbidden
- second chromatic accent
- emoji in product chrome (allowed inside agent-generated content)
- animated gradients
- backdrop-blur except command palette + sheet header (16 px, subtle)
- uppercase headings >3 words
- font-weight 700/800 — display caps at 600
- shadows on non-floating elements
````

## 6. Tech swap (run once)

```bash
cd frontend

npm i -D tailwindcss@^4 @tailwindcss/vite
npm i react-router-dom@^6 cmdk sonner @xyflow/react
npm i clsx tailwind-merge class-variance-authority @radix-ui/react-slot
npm i -D @types/node

# remove legacy config
rm tailwind.config.js postcss.config.js
```

Edit `frontend/vite.config.ts`:
```ts
import tailwind from "@tailwindcss/vite";
// add tailwind() to plugins
```

Move tokens into `frontend/src/index.css` under `@theme` (dark) + `[data-theme="light"]` overrides. Add `@layer base` rules for `body`, headings, selection.

For shadcn primitives, copy each manually into `frontend/src/components/ui/`:
`button.tsx, card.tsx, sheet.tsx, dialog.tsx, tabs.tsx, tooltip.tsx, accordion.tsx, command.tsx, dropdown-menu.tsx, scroll-area.tsx, skeleton.tsx, switch.tsx, progress.tsx, separator.tsx, avatar.tsx, badge.tsx, input.tsx, textarea.tsx, popover.tsx, kbd.tsx`.

Add `src/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
```

## 7. Final file layout

```
frontend/
├─ DESIGN.md
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx                            ← thin: just <ThemeProvider><RouterProvider/></ThemeProvider>
│  ├─ index.css                          ← @theme tokens + @layer base
│  ├─ lib/
│  │   ├─ cn.ts
│  │   ├─ theme.ts                       ← read/write [data-theme], persist
│  │   └─ shortcuts.ts                   ← g d / g p / ? / Esc
│  ├─ services/forgeApi.ts               ← keep
│  ├─ hooks/
│  │   ├─ useWebSocket.ts                ← keep, extend with subscribe-by-demand
│  │   ├─ useStreamBuffer.ts             ← NEW (see §11)
│  │   ├─ useTheme.ts                    ← NEW
│  │   └─ useShortcut.ts                 ← NEW
│  ├─ types/index.ts                     ← keep
│  ├─ components/
│  │   ├─ ui/                            ← shadcn primitives
│  │   ├─ shell/
│  │   │   ├─ AppShell.tsx               ← left rail + breadcrumb + outlet + Sonner
│  │   │   ├─ LeftRail.tsx
│  │   │   ├─ Breadcrumbs.tsx
│  │   │   ├─ CommandPalette.tsx         ← cmdk, mounted globally
│  │   │   └─ ThemeToggle.tsx
│  │   ├─ gate/
│  │   │   └─ Gate.tsx                   ← HITL primitive (§10)
│  │   ├─ demand/
│  │   │   ├─ DemandCard.tsx
│  │   │   ├─ StageChip.tsx
│  │   │   ├─ PlanCard.tsx               ← editable plan rows
│  │   │   ├─ TeamList.tsx
│  │   │   └─ RebalanceSignals.tsx
│  │   ├─ canvas/
│  │   │   ├─ AgentCanvas.tsx            ← @xyflow/react root
│  │   │   ├─ AgentNode.tsx              ← node wraps AgentFactoryScene doodle
│  │   │   ├─ AgentEdge.tsx              ← animated dashed edge
│  │   │   ├─ AgentPane.tsx              ← bottom panel: stream + tools + artefacts
│  │   │   └─ VerbositySlider.tsx
│  │   ├─ stream/
│  │   │   ├─ StreamView.tsx             ← markdown with structural-commit
│  │   │   ├─ CodeFrame.tsx              ← lazy-loaded prism
│  │   │   └─ ArtifactCard.tsx           ← materialised on completion
│  │   ├─ ide/                            ← keep current files; wrap as a tab
│  │   ├─ AgentFactoryScene.tsx          ← keep — used inside AgentNode
│  │   ├─ SettingsPanel.tsx              ← keep, restyle to tokens
│  │   ├─ SmartRoutingPanel.tsx          ← keep, restyle
│  │   └─ BootSplash.tsx                 ← keep, restyle
│  └─ routes/
│      ├─ root.tsx                        ← <AppShell/> with <Outlet/>
│      ├─ demands/
│      │   ├─ index.tsx                  ← kanban board
│      │   └─ Filters.tsx
│      ├─ demand/
│      │   ├─ new.tsx                    ← 3-step wizard
│      │   └─ $id/
│      │       ├─ index.tsx              ← redirects to /plan
│      │       ├─ plan.tsx
│      │       ├─ agents.tsx             ← AgentCanvas
│      │       ├─ files.tsx              ← IDE — file tree + Monaco
│      │       ├─ preview.tsx            ← iframe
│      │       └─ terminal.tsx
│      ├─ models.tsx                     ← routing matrix
│      └─ settings.tsx                   ← Settings sheet target
```

## 8. Information architecture

```
URL                            Page                                  Notes
─────────────────────────────  ────────────────────────────────────  ─────────────────────────────
/                              redirect → /demands
/demands                       Kanban by stage                       home
/demand/new                    3-step intake wizard
/demand/:id                    redirect → /demand/:id/plan
/demand/:id/plan               Editable plan card + HITL
/demand/:id/agents             Agentic canvas (centrepiece)
/demand/:id/files              IDE file tree + Monaco
/demand/:id/preview            Live Vite preview iframe
/demand/:id/terminal           xterm + agent log stream
/models                        Smart router matrix + catalog
/settings                      Settings (works as overlay sheet too)
```

App shell on every route except `/demand/new` (full-bleed wizard):
- **Left rail** 64 px collapsed, 220 px expanded. Items: Demands, Models, Settings. Collapse button at bottom. Theme toggle pinned bottom.
- **Top bar** breadcrumb (`◉ ForgeOS / Demands / DMD-7421 sales dashboard / Agents`) on the left, `⌘K` button + connection dot + user avatar on the right.
- **Sonner** mounted at bottom-right of the shell.

`⌘K` opens cmdk palette with sections:
- Go to: Demands, Models, Settings
- Demand: New demand, Open IDE for {recent}, Approve {pending}
- Theme: Switch to light/dark
- Recent demands (top 5)

Keyboard shortcuts (`useShortcut`):
- `g d` → /demands
- `g p` → current demand's /agents
- `g n` → /demand/new
- `?` → shortcut sheet
- `Esc` → close any overlay
- `e` → edit prompt in canvas pane
- `⌘K` → command palette
- `⌘.` → theme toggle

## 9. Page-by-page detailed spec

### 9.1 `/demands` — kanban network view

**Layout:** horizontal columns by stage with sticky headers. Stages in order: Ingested, Understanding, Deciding, Allocating, Awaiting approval, Executing, Monitoring, Explaining, Completed, Failed.

**Column header:** stage name (caption micro), live count, total token spend.

**Card** (use `<DemandCard/>`):
- top row: monospaced public_id · age (e.g. "3m") · priority pill (only if high or low — medium hidden)
- main row: one-line raw_text (truncated)
- bottom row: current agent avatar group + token spend (mono) + stage chip

Card hover: surface-2 + accent left-stripe 2px. Click → `/demand/:id/plan`.

**Top toolbar:** filter chips (priority, industry, stage, mine), `+ New demand` primary button (right-aligned).

**Empty state:** centered illustration (small SVG forge, mono outline), heading "The forge is cold", body "Start a demand to see it ship.", three starter-prompt chips clickable to `/demand/new?seed=…`.

**Loading:** five skeleton cards per visible column.

**Live update:** subscribe to `pipeline.stage` events globally; when a demand changes stage, animate it sliding to the new column (220 ms, ease-out-soft). Animate the count badge with a rolling-digit transition.

### 9.2 `/demand/new` — 3-step wizard

Full-bleed (no app shell). Top center: 3-step progress (numbered dots, current accent, completed success). Cancel button top-right returns to /demands.

**Step 1 — What.**
- Big textarea, auto-grow, max 12 rows, `placeholder` rotates 3 sample prompts.
- Below textarea: 4 chip groups (Industry, Priority, Timeline, Budget).
- 3 LLM-suggested starter chips (hard-coded fallback if `/api/demands/suggest` doesn't exist).
- Footer: `Cancel` (ghost) — char count (caption fg-muted) — `Next ⌘↵` (primary, disabled until non-empty).

**Step 2 — Plan review.**
- Header: "We understood your request as…" + confidence badge.
- One `<PlanCard/>` containing inline-editable rows:
  - Problem type · Domain · Complexity · Urgency · Estimated scope days
  - Risk factors (multi-tag editable)
  - Required skills (multi-tag)
  - Recommendation card (4 options visible only if confidence < 80%, else just the top one)
  - Team list (`<TeamList/>` collapsed by default — show top 3 + "show 4 more")
  - Cost summary (large display-lg number: total — caption: $/day × days)
- Footer: `Back` (ghost) — `Continue` (primary).

**Step 3 — Approve & launch.**
- Big number: estimated cost + token estimate + agent count + ETA.
- `<Gate mode="modal" />` with:
  - title "Launch DMD-XXXX?"
  - bullet summary (3-4 items: "spawn 6 agents", "estimated 22k tokens", "wall time ~14 min", "no production deploy")
  - cooldown 2000 ms
  - `requireTyped="launch"` only if `decision.execution_mode === "human_team"` OR `risk_factors.length >= 3`
- Primary button: `Launch` (accent), disabled until cooldown ends and (if required) word typed.
- On approve, route to `/demand/:id/agents`.

Preserve the local-fallback path (`buildLocalPlan`) for offline.

### 9.3 `/demand/:id` — workspace with tabs

**Header (under breadcrumb):** demand title (h1, derived from raw_text first 60 chars), public_id (mono caption), age, owner avatar, primary action (`Open IDE` when on /plan, or context-specific).

**Tabs** (underline style, accent bar 2 px): `Plan`  `Agents`  `Files`  `Preview`  `Terminal`. Each is its own route; tabs are just links.

#### 9.3.1 `/plan`
- Two columns at xl, single column below.
- Left: read-only `<PlanCard/>` (same component as Step 2, `readOnly` prop).
- Right: stage rail (vertical timeline with the 10 stages, current = accent ring + breathing animation 1.4 s), rebalance signals, reuse candidates accordion.
- Floating action `Open in canvas →` routes to `/agents`.

#### 9.3.2 `/agents` — the centrepiece
**Layout** (resizable panes, persist sizes to localStorage):
```
┌─ stage rail (horizontal, 9 chips, current breathes) ──────────────────┐
├─ canvas (xyflow, fits remaining height) ─────────┬─ plan strip ──────┤
│                                                  │ collapsed         │
│   AgentNode → AgentNode → AgentNode              │ vertical          │
│                                                  │ chips             │
│                                                  │                   │
├─ AgentPane (bottom, resizable, default 320px) ────────────────────────┤
│  selected agent — stream / tools / artefacts                          │
└───────────────────────────────────────────────────────────────────────┘
```

**`<AgentNode/>`** (≈ 220 × 200 px):
- Top: avatar = doodle from `AgentFactoryScene` (scaled), role label (h2)
- Middle: current task (caption fg-muted, 2-line clamp)
- Bottom: progress bar (height 4, accent) + model badge (caption mono) + token counter (mono)
- Status ring: idle = hairline; working = accent breathing (1.4 s); done = success; error = danger
- Click selects the node → `AgentPane` swaps to it.

**`<AgentEdge/>`:** dashed hairline. When `agent.code` chunks are flowing from the source, animate the dash offset.

**Graph:** PM → FE / BE → QA → Docs → DevOps.

**`<AgentPane/>` tabs:** `Stream`, `Tools`, `Artefacts`, `Logs`.
- `Stream` = `<StreamView/>` with markdown progressive render, structural commit on ` ``` ` open, persistent floating `[ Stop ]` button at top-right of the pane (always reachable).
- `Tools` = simple table of tool calls (name, args, result snippet, duration). 
- `Artefacts` = list of generated files with quick actions: `Open in Files`, `Open in Preview`, `Download`. Materialised on `agent.complete`.
- `Logs` = current `agent.log` feed for that agent only, with the verbosity slider applied.

**Canvas toolbar:** verbosity slider 1–10, `Re-run agent` button, model selector dropdown for that role, fit-view button.

#### 9.3.3 `/files` — IDE
Embed the existing `IDELayout` from `frontend/src/components/ide/` as the tab content. The standalone IDE route is gone. The Back button and Open-IDE button in the IDE shell are removed; the tab bar replaces them. AI Chat sidebar stays. Settings access is via the global rail.

#### 9.3.4 `/preview` — live preview
Iframe of the project's Vite server (call `/api/projects/:id/server/status`, start if not running). Above the iframe: device width chips (mobile 390, tablet 768, desktop full), reload button, "Open in new tab" link, status dot.

#### 9.3.5 `/terminal` — xterm + log
Two stacked panes: top = xterm (if you can wire it), bottom = `agent.log` filtered feed. Verbosity slider applies.

### 9.4 `/models`
Restyle `SmartRoutingPanel` to tokens. Wrap in a page with a header explaining the routing matrix. Add a "Test a prompt" inline panel that sends a 1-token prompt to each provider and shows latency.

### 9.5 `/settings`
Restyle `SettingsPanel`. Open as a Sheet from the right by default (so it overlays the current page); `/settings` URL renders it inline if visited directly. Persist tab selection in URL hash.

## 10. `<Gate/>` — HITL primitive

```ts
// components/gate/Gate.tsx
type GateMode =
  | { kind: "inline" }
  | { kind: "modal";   title: string; summary: string[] }
  | { kind: "max";     title: string; endpoint: string;
                       payload: unknown; blastRadius: string;
                       cooldownMs?: number;          // default 3000
                       requireTyped?: string };

export function Gate(props: {
  mode: GateMode;
  onConfirm: () => Promise<void> | void;
  children: (open: () => void) => React.ReactNode;
}): JSX.Element;
```

**inline** — renders a small confirm row next to the trigger ("Confirm? · Yes · No"). 140 ms slide-in.
**modal** — Dialog with title, summary list, primary button. Cooldown countdown shown on the button if set.
**max** — Dialog full overlay (backdrop-blur 16 px), shows endpoint + payload (formatted JSON, monospace, scrollable), blast radius caption, cooldown timer counting down, type-to-confirm input. Approve disabled until cooldown 0 AND typed word matches.

Usage examples in this build:
- `/demand/new` Step 3 → `modal` (or `max` if high-risk)
- demand card "Delete" menu → `max` with `requireTyped="delete"`
- IDE "Restart preview" → `inline`
- Settings "Reset routing to defaults" → `modal`
- Models "Switch primary provider" → `inline`

## 11. Streaming-UI discipline

**Hook (`src/hooks/useStreamBuffer.ts`):**
```ts
import { useCallback, useEffect, useRef } from "react";

export function useStreamBuffer<T>(onFlush: (batch: T[]) => void, ms = 40) {
  const queue = useRef<T[]>([]);
  const timer = useRef<number | null>(null);

  const push = useCallback((item: T) => {
    queue.current.push(item);
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      const batch = queue.current;
      queue.current = [];
      timer.current = null;
      onFlush(batch);
    }, ms);
  }, [onFlush, ms]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return push;
}
```

**Wiring in `AgentPane`:**
- Subscribe to `agent.code` deltas via the existing WebSocket hook (filter by `demand_id` + selected `agent_name`).
- Inside the pane, accumulate batches into a single string per agent via `useReducer`.
- Render `<StreamView/>` with `react-markdown` + `remark-gfm` and a custom `<code>` component that lazy-loads `prism-react-renderer` for the project's actual language only.
- The scroll container has `content-visibility: auto` and a fixed height (no thrash).
- When a ` ```lang ` open fence is detected mid-stream, immediately render a `<CodeFrame/>` placeholder with the language label so the rest of the layout doesn't jump.
- Floating `<button>Stop</button>` is `position: sticky; top: 0; right: 0` over the scroll container — always visible, sends a stop request via `forgeApi.stopAgent(demand_id, agent_name)` if the endpoint exists; otherwise dispatches a local "interrupted" state that hides further deltas.
- On `agent.complete`, fade the stream to read-only (60% opacity) and slide in an `<ArtifactCard/>` at the top of the pane (420 ms, ease-out-soft).

**Auto-scroll rule:** stick to bottom only if the user is within 24 px of the bottom; otherwise, do not steal scroll. Show a small "↓ jump to live" button when not stuck.

**Telemetry to expose** (caption text in the pane footer): TTFT (ms), chars, tokens/s, model, provider.

## 12. Quality bar (apply continuously)

1. **No hardcoded hex in TSX after Day 1's equivalent.** Use semantic Tailwind classes only (`bg-surface-1`, `text-fg-muted`, `border-hairline`). Configure Tailwind theme so these classes resolve to the `@theme` variables.
2. **Single accent rule:** after the rebuild, `grep -rE "cyan|violet|amber|rose|sky|emerald" frontend/src --include='*.tsx' --include='*.css'` should return only matches inside `success`/`warn`/`danger` semantic uses or `AgentFactoryScene.tsx` (the doodles, kept).
3. **A11y AA:**
   - Every interactive element reachable by Tab.
   - Focus rings visible (2 px accent, 35% alpha).
   - `aria-live="polite"` on streaming text.
   - `aria-label` on every icon-only button.
   - Contrast ≥ 4.5:1 against backgrounds for body text in both themes.
4. **Streaming hot path:** no long task > 50 ms during a stream (verify in DevTools Performance for one full demand).
5. **Mobile:** `/demands` and `/demand/:id/plan` must be usable at 390 px width. Canvas, IDE, Preview, Terminal may show "best on tablet+" notices.
6. **Build:** `npm run build` green. Bundle size budget: initial JS ≤ 350 KB gzip (lazy-load Monaco, prism, xyflow with `React.lazy`).
7. **Lighthouse** on `/demands`: Performance ≥ 95, Accessibility = 100, Best Practices ≥ 95.

## 13. Files to delete after migration

Verify each is unused, then remove:
- `frontend/src/pages/Demand.tsx`
- `frontend/src/pages/Demands.tsx`
- `frontend/src/pages/Pipeline.tsx`
- `frontend/src/pages/RolePortal.tsx` (or trim to <200 lines as `routes/home.tsx` if you keep a marketing surface)
- `frontend/src/components/GenerationPanel.tsx`
- `frontend/src/components/BrowserModelPanel.tsx`
- `frontend/src/components/LogPanel.tsx`
- `frontend/src/components/ProjectOutput.tsx`
- `frontend/src/components/PromptInput.tsx`
- `frontend/src/components/Dashboard.tsx`
- `frontend/src/components/AgentScene.tsx`
- `frontend/src/components/AgentCard.tsx`
- `frontend/src/components/Header.tsx`
- `tailwind.config.js`, `postcss.config.js`

Keep:
- `AgentFactoryScene.tsx` (used inside `AgentNode`)
- `LiveCodePanel.tsx` only if you use it as the basis for `StreamView`; otherwise delete after `StreamView` lands
- `SettingsPanel.tsx`, `SmartRoutingPanel.tsx`, `BootSplash.tsx`
- everything under `components/ide/`

## 14. Commit plan (logical milestones)

Commit at each of these waypoints; build must be green at every commit:

1. `chore(frontend): tailwind v4 + design tokens + theme toggle`
2. `feat(frontend): shadcn primitives + cn helper + dev sandbox`
3. `feat(frontend): app shell + react-router + command palette + shortcuts`
4. `feat(frontend): demands kanban board with live updates`
5. `feat(frontend): 3-step demand intake wizard with Gate`
6. `feat(frontend): demand workspace tabs (plan, files, preview, terminal)`
7. `feat(frontend): agent canvas with xyflow + agent pane + verbosity slider`
8. `feat(frontend): streaming discipline (useStreamBuffer + StreamView + ArtifactCard)`
9. `feat(frontend): models page + settings sheet restyle`
10. `chore(frontend): delete legacy pages and components`
11. `polish(frontend): empty / skeleton / error / sonner everywhere`
12. `docs: REDESIGN_CHANGES.md + screenshots`

## 15. Verification (before opening PR)

```bash
# from repo root
./start.sh

# in another shell
cd frontend
npm run build
npm run preview
```

Manual smoke test:
1. `/` redirects to `/demands`
2. Empty state visible at first; create a demand from a starter prompt
3. Step 1 → Step 2 → Step 3, approve, lands on `/demand/:id/agents`
4. Watch nodes light up; click a node, see the stream
5. Press `Stop` mid-stream — interrupts within 150 ms
6. Switch to Files tab — IDE loads, edit a file, preview tab updates
7. ⌘K opens palette; type "demands" — `Enter` navigates
8. `g d` works as a shortcut; `?` shows the cheat sheet
9. Toggle theme — every surface updates without reload
10. Resize to 390 px — `/demands` and `/plan` remain usable
11. Lighthouse on `/demands` ≥ 95 / 100 / 95

Run:
```bash
grep -rE "bg-slate|text-slate|border-slate|cyan|violet|amber|rose|sky|emerald" \
  frontend/src --include='*.tsx' --include='*.css' \
  | grep -v "AgentFactoryScene\|success\|warn\|danger\|info"
```
Output should be empty (or every remaining hit consciously justified in `REDESIGN_CHANGES.md`).

## 16. Final deliverables

On branch `feat/redesign-2026`:

1. All 12 commits above, in order, building green at each step.
2. `frontend/DESIGN.md` checked in.
3. `REDESIGN_CHANGES.md` at repo root — one page max, three sections: *What shipped*, *What was removed*, *Known gaps*.
4. Three screenshots (1440 × 900 dark mode): `/demands`, `/demand/:id/agents`, `/demand/:id/files`. Place under `docs/redesign/`.
5. PR body: bullet list of what changed, the three screenshots embedded, the grep result confirming no stray legacy colours, Lighthouse score.

## 17. Ask vs. proceed

**Proceed without asking** for:
- file names and folder structure inside the layout in §7
- copy text that isn't a destructive action
- motion timings within §5 ranges
- prop names and component composition
- which language to add to prism first (pick from package.json — usually `tsx`, `ts`, `json`, `markdown`)
- handling of edge cases not explicitly listed (default to "fail safe, show a toast, don't lose user state")

**Stop and ask** for:
- any backend endpoint or `WSEvent` field change
- any `start.sh` / `stop.sh` / `deploy/` change
- introducing a new top-level dependency not in §6
- deleting a file not on the §13 list

## 18. References (only if you need background)

- Linear 2026 refresh: https://linear.app/now/behind-the-latest-design-refresh
- Linear design tokens: https://www.shadcn.io/design/linear
- Streaming UIs (Brainy Papers): https://brainy.ink/paper/designing-streaming-uis
- Agentic UI 2026 Technical Manual: https://interconnectd.com/forum/thread/113/the-agentic-ui-designing-frontends-for-multi-agent-systems-2026-technical-m/
- Agent UX ≠ Chatbot UX: https://dev.to/victor_desg/agent-ux-is-not-chatbot-ux-and-most-teams-in-2026-ship-them-as-if-they-were-23bi
- Depute HITL components: https://github.com/Iambizi/depute
- Agentic Fabric (xyflow patterns): https://github.com/Qredence/agentic-fabric
- AG-UI protocol: https://ai.plainenglish.io/ai-agents-last-mile-ag-ui-the-protocol-that-solves-the-last-mile-problem-for-ai-agents-375be3d63df2

---

Now go. Read §4's files, post a 5-line plan, then execute end-to-end. Commit at every §14 waypoint. Open the PR when §16 is satisfied.
