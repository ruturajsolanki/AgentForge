# C-Site - Meeting Notes

## What this app is (important)

- AI-powered **sales orchestration** platform.
- Focus = **target achievement**, not just reporting.
- Core value = **tracking + nudges + escalation**.
- Not a passive monitoring dashboard.

## Users

- **Sales Heads** (~8): primary users, own quarterly targets.
- **BU Head**: quick executive view (2-3 min usage).

## Objective

- Sales Heads accept and achieve quarterly targets.
- AI suggests best deals to hit target.
- BU Head sees dynamic progress + risks in real time.
- System drives execution via reminders/escalations.

## Core concepts

- **Target**: pre-filled by BU Head; must be explicitly accepted.
- **Recurring revenue**: visibility only (not counted in target achievement).
- **Deal sources**:
  - CRM deals (primary, focus stage 7-8)
  - GTU deals (strategic logos)
  - New deals (user discovered)
  - New GTU deals (new strategic opportunities)

## Onboarding flow (stacked, no tabs)

1. Target shown -> Sales Head accepts.
2. AI suggests top CRM + GTU deals.
3. Optional add: New Deals / New GTU Deals.
4. Assign each selected deal to quarter:
   - Current / Next / Future
   - AI suggests quarter based on cycle + timeline.
5. Live target coverage updates continuously.
6. Submit only when full target is achieved.

### Rule

- Cannot submit unless target is fully covered.

## AI role

- Recommend top 5-10 high-probability deals.
- Reduce huge deal list to actionable list.
- Suggest realistic quarter per deal.
- Suggest additional deals to fill target gap.
- Detect stuck/no-update/delayed deals.

## Orchestration layer (most important)

- Track selected deals.
- Monitor CRM updates.
- Detect delays/no activity.
- Auto notify user.
- Escalate to BU Head if needed.

### Channels

- Email
- WhatsApp/SMS
- In-app notifications

### Key principle

- Users should be able to update from outside app (email/message forms).

### Escalation logic

- No update -> reminder
- Continued delay -> follow-up
- No response -> escalation to BU Head

## Data quality plan

- Phase 1: manual review panel.
- Phase 2: AI anomaly detection.

## BU Head dashboard (2-minute view)

- Total Target vs Accepted
- Region-wise progress
- Deal breakdown:
  - CRM
  - GTU
  - New Deals
  - New GTU Deals
- Recurring revenue (visibility)

### Actions

- Acknowledge performance
- Send quick messages
- View risk/insight drill-down

## UX principles

- Minimal UI
- No tabs / low navigation
- Guided flow (AI-led)
- Large readable numbers
- Clear progress indicators
- Fast and low-effort interactions

## Constraints

- Adoption resistance possible.
- Must reduce effort to near zero.
- Value should be visible immediately.
- External update support is mandatory.

## Immediate next steps

1. Onboarding wireframe (stacked flow)
2. Orchestration flow definition
3. BU Head dashboard layout
4. AI recommendation engine

## Future additions

- Voice query insights (example: "Why is LATAM behind?")
- Chat insights for delays and gap analysis

## UI inspiration

- TRAC
- OLAB
- Zoho CRM
- Scoreboard-like dashboards
- Notification-first workflow apps

