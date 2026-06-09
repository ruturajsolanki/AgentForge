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
accent-fg    #FFFFF# Type

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
No parallax. No gradient a spring overshoot except on icons ≤24 px.

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

## Delivery Layer Components

### SwonBadge
Pill with lifecycle dot + SWON-XXXXX monospace ID. States map to:
- Initiated: blue-100    Planning: purple-100
- Executing: amber-100   Monitoring: cyan-100
- Closing: orange-100    Warranty: green-100    Closed: gray-100

### WonBadge
Same pill style. Billable indicator shows `$` in emerald. States:
Active: green  Extended: blue  Released: gray  Renewed: amber

### TaskCard
Surface-1 card. Header: public_id mono + status badge. Body: priority dot, hours fraction, SLA date (red if overdue), blocked_reason truncated. Click → drawer.

### TaskBoard
5-col kanban (Todo / InProgress / Review / Blocked / Done). Muted header with count pill. Cards are TaskCard.

### HandoffDialog
Modal gate using Dialog. Select for target member, textarea for reason. Two CTAs: Cancel (outline) + Confirm Handoff (primary).

### ActivityTimeline
Vertical timeline with colored dots per action type (green=created, blue=updated, emerald=approved, amber=state_changed, purple=handoff, red=deleted). Expandable diff viewer. Timestamps right-aligned.

### CapacityHeatmap
Table with member names (sticky left) and day columns. Cells colored by intensity: 0h=gray-100, 1-2h=green-200, 3-4h=green-400, 5-6h=amber-300, 7-8h=orange-400, 8h+=red-500.

### Role Dashboard Colors
Each role dashboard uses the same surface/accent tokens. No role-specific colors — differentiation is through content and layout, not theme.

## Forbidden
- second chromatic accent
- emoji in product chrome (allowed inside agent-generated content)
- animated gradients
- backdrop-blur except command pte + sheet header (16 px, subtle)
- uppercase headings >3 words
- font-weight 700/800 — display caps at 600
- shadows on non-floating elements
