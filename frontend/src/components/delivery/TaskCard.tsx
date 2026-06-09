import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import type { TaskItem } from "../../types";

const STATUS_COLORS: Record<string, string> = {
  Todo: "bg-gray-100 text-gray-700",
  InProgress: "bg-blue-100 text-blue-700",
  Review: "bg-purple-100 text-purple-700",
  Blocked: "bg-red-100 text-red-700",
  Done: "bg-green-100 text-green-700",
};

const PRIORITY_ICON: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-gray-400",
};

interface Props {
  task: TaskItem;
  onClick?: () => void;
}

export default function TaskCard({ task, onClick }: Props) {
  const slaOverdue =
    task.sla_due_at && new Date(task.sla_due_at) < new Date() && task.status !== "Done";

  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${
        slaOverdue ? "border-red-300" : ""
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground">{task.public_id}</span>
          <Badge className={STATUS_COLORS[task.status] ?? ""} variant="secondary">
            {task.status}
          </Badge>
        </div>
        <CardTitle className="text-sm leading-tight">{task.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className={PRIORITY_ICON[task.priority] ?? ""}>
            {task.priority}
          </span>
          {task.est_hours != null && (
            <span>
              {task.actual_hours ?? 0}/{task.est_hours}h
            </span>
          )}
        </div>
        {task.sla_due_at && (
          <div className={slaOverdue ? "font-medium text-red-600" : ""}>
            SLA: {new Date(task.sla_due_at).toLocaleDateString()}
          </div>
        )}
        {task.blocked_reason && (
          <div className="text-red-600 truncate">{task.blocked_reason}</div>
        )}
      </CardContent>
    </Card>
  );
}
