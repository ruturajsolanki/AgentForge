import SwonBadge from "../components/delivery/SwonBadge";
import WonBadge from "../components/delivery/WonBadge";
import TaskCard from "../components/delivery/TaskCard";
import TaskBoard from "../components/delivery/TaskBoard";
import ActivityTimeline from "../components/delivery/ActivityTimeline";
import CapacityHeatmap from "../components/delivery/CapacityHeatmap";
import type { TaskItem, AuditEventItem } from "../types";

const DEMO_TASKS: TaskItem[] = [
  { id: "1", public_id: "TSK-001A", demand_id: "d1", title: "Setup project scaffold", status: "Done", priority: "high", est_hours: 4, actual_hours: 3, created_at: new Date().toISOString(), completed_at: new Date().toISOString() },
  { id: "2", public_id: "TSK-002B", demand_id: "d1", title: "Design database schema", status: "InProgress", priority: "critical", est_hours: 8, actual_hours: 5, sla_due_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() },
  { id: "3", public_id: "TSK-003C", demand_id: "d1", title: "Build API endpoints", status: "Todo", priority: "medium", est_hours: 16, created_at: new Date().toISOString() },
  { id: "4", public_id: "TSK-004D", demand_id: "d1", title: "Implement auth module", status: "Review", priority: "high", est_hours: 12, actual_hours: 10, created_at: new Date().toISOString() },
  { id: "5", public_id: "TSK-005E", demand_id: "d1", title: "Fix deployment pipeline", status: "Blocked", priority: "critical", blocked_reason: "Waiting for DevOps access", est_hours: 6, created_at: new Date().toISOString() },
  { id: "6", public_id: "TSK-006F", demand_id: "d1", title: "Create frontend UI", status: "InProgress", priority: "medium", est_hours: 20, actual_hours: 8, sla_due_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date().toISOString() },
];

const DEMO_EVENTS: AuditEventItem[] = [
  { id: "e1", entity_kind: "demand", entity_id: "d1-abc", action: "created", created_at: new Date(Date.now() - 3600000 * 5).toISOString() },
  { id: "e2", entity_kind: "swon", entity_id: "s1-def", action: "state_changed", diff: { before: "Initiated", after: "Executing" }, created_at: new Date(Date.now() - 3600000 * 4).toISOString() },
  { id: "e3", entity_kind: "task", entity_id: "t1-ghi", action: "status_change", diff: { before: "Todo", after: "InProgress" }, actor_id: "user-123", created_at: new Date(Date.now() - 3600000 * 3).toISOString() },
  { id: "e4", entity_kind: "task", entity_id: "t2-jkl", action: "handoff", diff: { to_user_id: "user-456", reason: "Domain expertise needed" }, created_at: new Date(Date.now() - 3600000 * 2).toISOString() },
  { id: "e5", entity_kind: "task", entity_id: "t1-ghi", action: "approved", created_at: new Date(Date.now() - 3600000).toISOString() },
];

const DEMO_MEMBERS = [
  { name: "Ravi Kumar", dailyHours: [6, 8, 7, 4, 8, 6, 0, 5, 8, 7, 6, 8, 3, 0] },
  { name: "Priya Sharma", dailyHours: [8, 8, 6, 8, 4, 2, 0, 8, 8, 6, 8, 4, 2, 0] },
  { name: "Amit Desai", dailyHours: [4, 6, 8, 8, 6, 4, 0, 4, 6, 8, 8, 6, 4, 0] },
  { name: "Sneha Patel", dailyHours: [2, 4, 6, 8, 8, 6, 0, 2, 4, 6, 8, 8, 6, 0] },
];

export default function DeliveryGallery() {
  return (
    <div className="space-y-10 p-6">
      <h1 className="text-2xl font-bold">Delivery Component Gallery</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">SWON Badge</h2>
        <div className="flex flex-wrap gap-3">
          <SwonBadge publicId="SWON-A1B2C" state="Initiated" />
          <SwonBadge publicId="SWON-D3E4F" state="Planning" />
          <SwonBadge publicId="SWON-G5H6I" state="Executing" />
          <SwonBadge publicId="SWON-J7K8L" state="Monitoring" />
          <SwonBadge publicId="SWON-M9N0P" state="Closing" />
          <SwonBadge publicId="SWON-Q1R2S" state="Warranty" />
          <SwonBadge publicId="SWON-T3U4V" state="Closed" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">WON Badge</h2>
        <div className="flex flex-wrap gap-3">
          <WonBadge publicId="WON-X1Y2Z" state="Active" billable={true} />
          <WonBadge publicId="WON-A3B4C" state="Extended" billable={true} />
          <WonBadge publicId="WON-D5E6F" state="Released" billable={false} />
          <WonBadge publicId="WON-G7H8I" state="Renewed" billable={true} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Task Card</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {DEMO_TASKS.slice(0, 3).map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Task Board (Kanban)</h2>
        <TaskBoard tasks={DEMO_TASKS} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Activity Timeline</h2>
        <div className="max-w-xl">
          <ActivityTimeline events={DEMO_EVENTS} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Capacity Heatmap</h2>
        <CapacityHeatmap members={DEMO_MEMBERS} />
      </section>
    </div>
  );
}
