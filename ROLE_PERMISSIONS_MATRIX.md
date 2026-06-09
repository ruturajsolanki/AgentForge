# Role Permissions Matrix

## Roles Hierarchy

| Role | Level | Description |
|---|---|---|
| **Executive** | 6 | Organization CTO/VP — full read access, executive dashboard, all reports |
| **Higher Manager** | 5 | VP Delivery — sanitized portfolio view, no failure data exposed |
| **Manager** | 4 | Delivery Manager — full demand lifecycle control, team allocation, approvals |
| **Middleware** | 3 | Middleware Ops — intake approval queue, demand routing |
| **Leader** | 2 | Team Leader — task management, team execution tracking |
| **Delivery Team** | 2 | Delivery Operations — task execution, delivery tracking |
| **Member** | 1 | Team Member — own task view, status updates |
| **Contributor** | 1 | External Contributor — limited task access |
| **Viewer** | 0 | Read-only audit access |
| **Client** | 0 | External client — demand intake portal only |

## Permission Matrix

| Permission | Executive | Higher Manager | Manager | Middleware | Leader | Delivery Team | Member | Contributor | Viewer | Client |
|---|---|---|---|---|---|---|---|---|---|---|
| **Dashboards** | | | | | | | | | | |
| Executive Dashboard | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Higher Manager Dashboard | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manager Dashboard | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Middleware Dashboard | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Leader Dashboard | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Member Dashboard | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Demands** | | | | | | | | | | |
| View all demands | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create demand | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅* |
| Approve demand | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change stage | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reassign demand | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View delivery details | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Tasks** | | | | | | | | | | |
| View all tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Own only | Own only | ❌ | ❌ |
| Create task | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update task status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Handoff task | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **SWON / WON** | | | | | | | | | | |
| View SWON records | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create SWON | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update SWON state | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create WON | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reports** | | | | | | | | | | |
| Delivery report | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Team performance report | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Demand aging report | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| SLA compliance report | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Export (CSV/Excel) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Portfolio (sanitized) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Audit** | | | | | | | | | | |
| View audit events | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Team Management** | | | | | | | | | | |
| View team members | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create/edit team member | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

*Client can create demands via the intake portal only.

## Data Visibility Rules

| Role | Demand Visibility |
|---|---|
| Executive, Higher Manager | All tenant demands |
| Manager | Demands they manage or created |
| Middleware | Demands awaiting approval + assigned to them |
| Leader | Demands assigned to them as leader |
| Delivery Team | Demands they are working on |
| Member, Contributor | Own tasks only |
| Viewer | Read-only access to all audit events |
| Client | Own submitted demands only |

## Higher Manager Sanitization

The Higher Manager view explicitly hides:
- Demands with `stage = failed` or `cancelled`
- Error fields, risk factors, individual member names
- SLA breach counts, blocked reasons, escalation history
- Only shows: `executing`, `monitoring`, `completed` stages

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Executive | exec@forgeos.demo | exec123 |
| Higher Manager | hm@forgeos.demo | hm123 |
| Manager | manager@forgeos.demo | manager123 |
| Middleware | middleware@forgeos.demo | middleware123 |
| Leader | leader@forgeos.demo | leader123 |
| Delivery Team | delivery@forgeos.demo | delivery123 |
| Member | member@forgeos.demo | member123 |
| Contributor | contributor@forgeos.demo | contrib123 |
| Viewer | viewer@forgeos.demo | viewer123 |
| Client | client@forgeos.demo | client123 |
