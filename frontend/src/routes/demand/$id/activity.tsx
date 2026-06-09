import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import ActivityTimeline from "../../../components/delivery/ActivityTimeline";
import type { AuditEventItem } from "../../../types";

export default function DemandActivityRoute() {
  const { id } = useParams<{ id: string }>();
  const publicId = id || "";

  return (
    <DemandWorkspace publicId={publicId} active="activity">
      {(resource) => <ActivityContent demandId={resource.demand?.id ?? ""} />}
    </DemandWorkspace>
  );
}

function ActivityContent({ demandId }: { demandId: string }) {
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!demandId) return;
    fetch(`/api/audit?entity_kind=demand&entity_id=${demandId}&limit=200`)
      .then((r) => r.json())
      .then((data) => setEvents(data.items ?? data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [demandId]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading activity...</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">Activity Timeline</h2>
      <ActivityTimeline events={events} />
    </div>
  );
}
