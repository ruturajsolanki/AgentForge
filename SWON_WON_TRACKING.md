# SWON & WON Tracking Documentation

## Overview

The Demand Delivery Pipeline uses two tracking concepts inherited from TCS delivery methodology:

- **SWON** (Service Work Order Number) — The top-level work order for an approved demand
- **WON** (Work Order Number) — Per-resource billable allocation under a SWON

Together they form a **SWON → WON hierarchy** that maps demand delivery to financial tracking.

## SWON — Service Work Order Number

### Purpose
A SWON is created when a demand is approved for execution. It represents the contractual commitment to deliver the work, linking the demand to financial tracking (billing, LOA references, SOW).

### Schema

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Multi-tenant isolation |
| `demand_id` | UUID | FK to the demand this SWON tracks |
| `public_id` | String | Human-readable ID (e.g., `SWON-A1B2C3D4`) |
| `customer_loa_ref` | String | Customer Letter of Authorization reference |
| `sow_summary` | Text | Statement of Work summary |
| `lifecycle_state` | String | Current state in the lifecycle |
| `opened_at` | DateTime | When the SWON was opened |
| `closed_at` | DateTime | When the SWON was closed (nullable) |
| `total_value_inr` | Float | Total contracted value in INR |
| `billing_currency` | String | Currency code (default: INR) |

### Lifecycle States

```
Initiated → Planning → Executing → Monitoring → Closing → Warranty → Closed
```

| State | Description |
|---|---|
| **Initiated** | SWON created, demand approved |
| **Planning** | Resource allocation and WON creation in progress |
| **Executing** | Active delivery work underway |
| **Monitoring** | Delivery oversight, quality checks |
| **Closing** | Wrapping up, final deliverables |
| **Warranty** | Post-delivery support period |
| **Closed** | SWON completed, all WONs released |

### How SWONs Are Created

1. A demand reaches `awaiting_approval` stage
2. Manager approves the demand
3. System creates a SWON record linked to the demand
4. SWON enters `Initiated` state
5. As delivery progresses, SWON state advances through the lifecycle

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/swon` | List all SWONs for the tenant |
| `GET` | `/api/swon/{id}` | Get SWON by public_id or UUID |
| `POST` | `/api/swon` | Create a new SWON (manager+) |
| `PATCH` | `/api/swon/{id}/state` | Update SWON lifecycle state (manager+) |

---

## WON — Work Order Number

### Purpose
A WON represents a **per-resource billable allocation** under a SWON. Each team member assigned to a delivery gets their own WON, tracking their allocation percentage, cost centre, and monthly billing value.

### Schema

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Multi-tenant isolation |
| `swon_id` | UUID | FK to the parent SWON |
| `public_id` | String | Human-readable ID (e.g., `WON-X1Y2Z3`) |
| `billable` | Boolean | Whether this allocation is billable |
| `resource_id` | UUID | FK to the assigned user/resource |
| `cost_centre` | String | Organizational cost centre code |
| `allocation_pct` | Float | Percentage of the resource's time (0-100) |
| `start_date` | Date | Allocation start date |
| `end_date` | Date | Allocation end date |
| `monthly_value_inr` | Float | Monthly billing value in INR |
| `state` | String | Current state |

### WON States

| State | Description |
|---|---|
| **Active** | Resource is currently allocated |
| **Extended** | Allocation period has been extended |
| **Released** | Resource has been released from this work |
| **Renewed** | Allocation renewed for a new period |

### How WONs Are Created

1. A SWON moves to `Planning` state
2. Manager allocates resources from the team pool
3. For each resource, a WON is created under the SWON
4. WON tracks the specific person, their allocation %, and billing

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/won` | List WONs (filter by `swon_id`) |
| `POST` | `/api/won` | Create a new WON (manager+) |
| `PATCH` | `/api/won/{id}` | Update WON state (manager+) |

---

## Reporting

### SWON Detail Report
- **Endpoint:** `GET /api/reports/swon-detail`
- **Formats:** JSON, CSV, Excel
- **Content:** SWON records with lifecycle state, value, WON count, total monthly value

### Dashboard Widgets

The SWON/WON data appears in:

1. **Executive Dashboard** — SWON count, WON count as KPI cards
2. **Manager Dashboard** — SWONs MTD, Active WONs as KPIs
3. **Delivery Detail Page** (`/demand/:id/delivery`) — SWON badge, WON records list with drill-down
4. **Reports Page** — SWON Detail tab with exportable table
5. **Higher Manager Dashboard** — Active/Closed SWON counts (sanitized view)

### UI Components

| Component | Purpose |
|---|---|
| `SwonBadge` | Displays SWON ID + lifecycle state with color coding |
| `WonBadge` | Displays WON ID + state + billable indicator |

---

## Relationship Diagram

```
DemandRequest (1) ──→ (1) SwonRecord ──→ (N) WonRecord
                 │                           │
                 └──→ (N) Task               └──→ User (resource)
```

Each approved demand gets exactly one SWON. Each SWON can have multiple WONs (one per allocated resource).
