import { useMemo } from "react";
import TaskCard from "./TaskCard";
import type { TaskItem, TaskStatus } from "../../types";

const COLUMNS: TaskStatus[] = ["Todo", "InProgress", "Review", "Blocked", "Done"];
const COL_LABELS: Record<TaskStatus, string> = {
  Todo: "To Do",
  InProgress: "In Progress",
  Review: "Review",
  Blocked: "Blocked",
  Done: "Done",
};

interface Props {
  tasks: TaskItem[];
  onTaskClick?: (task: TaskItem) => void;
}

export default function TaskBoard({ tasks, onTaskClick }: Props) {
  const grouped = useMemo(() => {
    const m: Record<string, TaskItem[]> = {};
    for (const col of COLUMNS) m[col] = [];
    for (const t of tasks) {
      const bucket = COLUMNS.includes(t.status as TaskStatus) ? t.status : "Todo";
      m[bucket].push(t);
    }
    return m;
  }, [tasks]);

  return (
    <div className="grid grid-cols-5 gap-3">
      {COLUMNS.map((col) => (
        <div key={col} className="space-y-2">
          <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-1.5 text-xs font-medium">
            <span>{COL_LABELS[col]}</span>
            <span className="ml-1 rounded-full bg-background px-1.5 text-[10px]">
              {grouped[col].length}
            </span>
          </div>
          <div className="space-y-2">
            {grouped[col].map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => onTaskClick?.(task)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
