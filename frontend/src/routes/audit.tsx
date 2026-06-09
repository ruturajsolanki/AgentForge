import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import ActivityTimeline from "../components/delivery/ActivityTimeline";
import type { AuditEventItem, PaginatedAuditResponse } from "../types";

const PAGE_SIZE = 50;

const ENTITY_KINDS = ["all", "demand", "swon", "won", "task", "handoff", "team_member", "user_role"] as const;

export default function AuditPage() {
  const [items, setItems] = useState<AuditEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityKind, setEntityKind] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async (off: number, kind: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
      if (kind && kind !== "all") params.set("entity_kind", kind);
      const resp = await fetch(`/api/audit?${params}`);
      const data: PaginatedAuditResponse = await resp.json();
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(offset, entityKind);
  }, [offset, entityKind, fetchData]);

  const filtered = search
    ? items.filter(
        (i) =>
          i.entity_id.toLowerCase().includes(search.toLowerCase()) ||
          i.action.toLowerCase().includes(search.toLowerCase()) ||
          i.entity_kind.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Audit History</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Entity Type</label>
          <select
            value={entityKind}
            onChange={(e) => { setEntityKind(e.target.value); setOffset(0); }}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {ENTITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === "all" ? "All Types" : k.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by entity ID, action..."
            className="rounded-md border bg-background px-3 py-1.5 text-sm w-64"
          />
        </div>

        <div className="ml-auto text-sm text-muted-foreground">
          {total} total events
        </div>
      </div>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Events {entityKind !== "all" && <span className="capitalize">— {entityKind.replace("_", " ")}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events found.</p>
          ) : (
            <>
              {/* Table view */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Timestamp</th>
                      <th className="pb-2 pr-4 font-medium">Entity</th>
                      <th className="pb-2 pr-4 font-medium">Entity ID</th>
                      <th className="pb-2 pr-4 font-medium">Action</th>
                      <th className="pb-2 pr-4 font-medium">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ev) => (
                      <tr key={ev.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                          {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 pr-4 capitalize">{ev.entity_kind.replace("_", " ")}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{ev.entity_id.substring(0, 12)}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            ev.action === "created"
                              ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                              : ev.action === "deleted"
                              ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                          }`}>
                            {ev.action}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground max-w-[300px] truncate">
                          {ev.diff ? Object.keys(ev.diff).join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    className="rounded-md border px-3 py-1 text-sm disabled:opacity-40 hover:bg-muted"
                  >
                    Previous
                  </button>
                  <span className="flex items-center text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    className="rounded-md border px-3 py-1 text-sm disabled:opacity-40 hover:bg-muted"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
