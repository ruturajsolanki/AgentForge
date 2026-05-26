# ForgeOS Redesign Changes

## What shipped

- Rebuilt the frontend as a routed operator console with Tailwind v4 tokens, dark/light theme support, left rail navigation, breadcrumbs, Sonner toasts, command palette, and keyboard shortcuts.
- Added the demand kanban home, 3-step intake wizard with local fallback planning, HITL `Gate`, demand workspace tabs, embedded IDE tab, preview/terminal views, React Flow agent canvas, streaming buffer, StreamView, and model/settings pages.
- Reworked the kept IDE and settings surfaces onto the Forge ember token system and verified the legacy color grep returns empty outside the allowed AgentFactoryScene exception.

## What was removed

- Removed the legacy demand, pipeline, dashboard, prompt, project output, log, agent scene/card, header, generation, browser model, and live code panel surfaces.
- Removed Tailwind v3 and PostCSS config in favor of Tailwind v4 through the Vite plugin.

## Known gaps

- Monaco, React Flow, and WebLLM still dominate the initial bundle; deeper route-level lazy loading is needed to meet the 350 KB gzip budget.
- The "Test a prompt" model panel uses the frozen model catalog endpoint as a latency sample because there is no frozen provider inference endpoint.
- Lighthouse and browser screenshots depend on local browser/screen-capture availability in this environment.
