import { useMemo } from "react";

interface MemberLoad {
  name: string;
  dailyHours: number[];
}

interface Props {
  members: MemberLoad[];
  days?: number;
  className?: string;
}

function intensityClass(hours: number): string {
  if (hours === 0) return "bg-gray-100";
  if (hours <= 2) return "bg-green-200";
  if (hours <= 4) return "bg-green-400";
  if (hours <= 6) return "bg-amber-300";
  if (hours <= 8) return "bg-orange-400";
  return "bg-red-500";
}

export default function CapacityHeatmap({ members, days = 14, className = "" }: Props) {
  const labels = useMemo(() => {
    const arr: string[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      arr.push(d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));
    }
    return arr;
  }, [days]);

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-1 text-left font-medium">Member</th>
            {labels.map((l, i) => (
              <th key={i} className="px-1 py-1 text-center font-normal text-muted-foreground">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.name}>
              <td className="sticky left-0 bg-background px-2 py-1 font-medium truncate max-w-[120px]">
                {m.name}
              </td>
              {Array.from({ length: days }, (_, i) => {
                const h = m.dailyHours[i] ?? 0;
                return (
                  <td key={i} className="px-0.5 py-0.5">
                    <div
                      className={`mx-auto h-5 w-5 rounded-sm ${intensityClass(h)}`}
                      title={`${h}h`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
