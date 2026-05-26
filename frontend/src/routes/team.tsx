import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle2, Plus, Save, Search, Trash2, UserRoundPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { Separator } from "../components/ui/separator";
import { forgeApi } from "../services/forgeApi";
import type { AllocatedResource, Demand } from "../types";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  experience: string;
  aiReadiness: "advanced" | "active" | "learning";
  availability: string;
  skills: string[];
  assignment: string;
}

const KEY = "forgeos.managerTeam";

const initialTeam: TeamMember[] = [
  { id: "tm-1", name: "Sam Rivera", role: "React Frontend Engineer", experience: "7 yrs", aiReadiness: "advanced", availability: "55%", skills: ["react", "typescript", "ux"], assignment: "Available" },
  { id: "tm-2", name: "Daniel Kim", role: "Analytics Engineer", experience: "8 yrs", aiReadiness: "active", availability: "40%", skills: ["analytics", "sql", "visualization"], assignment: "Retail loyalty dashboard" },
  { id: "tm-3", name: "Maya Iyer", role: "Product Strategist", experience: "9 yrs", aiReadiness: "learning", availability: "65%", skills: ["requirements", "ux", "stakeholders"], assignment: "Available" },
  { id: "tm-4", name: "Forge-FE", role: "AI Frontend Agent", experience: "AI agent", aiReadiness: "advanced", availability: "100%", skills: ["react", "typescript", "responsive_ui"], assignment: "Suggested pool" },
];

const emptyDraft: Omit<TeamMember, "id"> = {
  name: "",
  role: "AI Engineer",
  experience: "",
  aiReadiness: "learning",
  availability: "50%",
  skills: [],
  assignment: "Available",
};

const readinessFilters = ["all", "advanced", "active", "learning"] as const;

export default function TeamRoute() {
  const [team, setTeam] = useState<TeamMember[]>(() => readTeam());
  const [draft, setDraft] = useState(emptyDraft);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [selectedId, setSelectedId] = useState(() => readTeam()[0]?.id || "");
  const [query, setQuery] = useState("");
  const [readiness, setReadiness] = useState<(typeof readinessFilters)[number]>("all");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    forgeApi.listDemands().then(setDemands).catch(() => setDemands([]));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(KEY, JSON.stringify(team));
    if (team.length && !team.some((member) => member.id === selectedId)) setSelectedId(team[0].id);
  }, [selectedId, team]);

  const suggested = useMemo(() => {
    const latest = demands.find((demand) => demand.allocation?.team?.length);
    return latest?.allocation?.team || [];
  }, [demands]);

  const stats = useMemo(() => {
    const available = team.filter((member) => member.assignment.toLowerCase() === "available").length;
    const agents = team.filter((member) => member.experience.toLowerCase().includes("agent") || member.role.toLowerCase().includes("agent")).length;
    const advanced = team.filter((member) => member.aiReadiness === "advanced").length;
    const averageAvailability = team.length
      ? Math.round(team.reduce((sum, member) => sum + parsePercent(member.availability), 0) / team.length)
      : 0;
    return { available, agents, advanced, averageAvailability };
  }, [team]);

  const filteredTeam = useMemo(() => {
    const q = query.trim().toLowerCase();
    return team.filter((member) => {
      const matchesQuery = !q || `${member.name} ${member.role} ${member.assignment} ${member.skills.join(" ")}`.toLowerCase().includes(q);
      const matchesReadiness = readiness === "all" || member.aiReadiness === readiness;
      return matchesQuery && matchesReadiness;
    });
  }, [query, readiness, team]);

  const selected = filteredTeam.find((member) => member.id === selectedId) || filteredTeam[0] || null;

  const addMember = () => {
    if (!draft.name.trim() || !draft.role.trim()) {
      toast.error("Add a name and role");
      return;
    }
    const member = { ...draft, id: `tm-${Date.now()}`, skills: normalizeSkills(draft.skills.join(",")) };
    setTeam((current) => [member, ...current]);
    setSelectedId(member.id);
    setQuery("");
    setReadiness("all");
    setDraft(emptyDraft);
    setAddOpen(false);
    toast.success("Team member added");
  };

  const addSuggested = (resource: AllocatedResource) => {
    const member: TeamMember = {
      id: `tm-${Date.now()}-${resource.name}`,
      name: resource.name,
      role: resource.title || resource.resource_type.replace(/_/g, " "),
      experience: resource.seniority === "agent" ? "AI agent" : "Not set",
      aiReadiness: resource.seniority === "agent" ? "advanced" : "active",
      availability: `${Math.round(resource.allocation_percentage * 100)}%`,
      skills: resource.skills,
      assignment: "Suggested pool",
    };
    setTeam((current) => [member, ...current]);
    setSelectedId(member.id);
    setQuery("");
    setReadiness("all");
    toast.success(`${resource.name} added to team`);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Manager</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg-strong">Team management</h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-fg-muted">
            Maintain capacity, AI readiness, skills, and assignments before approving demand execution.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add member
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Resources" value={team.length} helper={`${stats.agents} AI agents`} />
        <Metric label="Available" value={stats.available} helper="not assigned" />
        <Metric label="AI advanced" value={stats.advanced} helper="ready for agentic work" />
        <Metric label="Avg capacity" value={`${stats.averageAvailability}%`} helper="declared availability" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-fg-muted" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, skills, assignment" />
          </div>
          <div className="flex flex-wrap gap-2">
            {readinessFilters.map((item) => (
              <Button key={item} size="sm" variant={readiness === item ? "primary" : "secondary"} onClick={() => setReadiness(item)}>
                {item}
              </Button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => toast.success("Team saved locally")}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Resource roster</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">{filteredTeam.length} shown from {team.length} total</p>
            </div>
            <UsersRound className="h-5 w-5 text-accent" />
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredTeam.length ? filteredTeam.map((member) => (
              <RosterRow
                key={member.id}
                member={member}
                selected={selected?.id === member.id}
                onSelect={() => setSelectedId(member.id)}
              />
            )) : (
              <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-hairline bg-surface-2 p-6 text-center">
                <div>
                  <div className="text-sm font-semibold text-fg-strong">No matching resources</div>
                  <p className="mt-1 text-sm text-fg-muted">Clear search or switch readiness filter.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <MemberDetail
          member={selected}
          setTeam={setTeam}
          onDelete={(id) => {
            setTeam((current) => current.filter((member) => member.id !== id));
            toast.success("Team member removed");
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>AI suggested resources</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">Derived from the latest demand allocation. Add only what the manager wants to staff.</p>
            </div>
            <Badge>{suggested.length || 0} suggestions</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {suggested.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {suggested.slice(0, 9).map((resource) => (
                <SuggestedResource key={`${resource.name}-${resource.resource_type}`} resource={resource} onAdd={() => addSuggested(resource)} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-hairline bg-surface-2 p-6 text-sm text-fg-muted">
              Create or load a demand to see AI-suggested resources here.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent onClose={() => setAddOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <Editable label="Name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
            <Editable label="Role" value={draft.role} onChange={(value) => setDraft((current) => ({ ...current, role: value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Editable label="Experience" value={draft.experience} onChange={(value) => setDraft((current) => ({ ...current, experience: value }))} />
              <Editable label="Availability" value={draft.availability} onChange={(value) => setDraft((current) => ({ ...current, availability: value }))} />
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs text-fg-muted">AI readiness</span>
              <select className="h-9 rounded-lg border border-hairline bg-surface-1 px-2 text-sm text-fg outline-none focus:border-accent" value={draft.aiReadiness} onChange={(event) => setDraft((current) => ({ ...current, aiReadiness: event.target.value as TeamMember["aiReadiness"] }))}>
                <option value="advanced">advanced</option>
                <option value="active">active</option>
                <option value="learning">learning</option>
              </select>
            </label>
            <Editable label="Skills" value={draft.skills.join(", ")} onChange={(value) => setDraft((current) => ({ ...current, skills: normalizeSkills(value) }))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={addMember}>Add member</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-fg-muted">{label}</div>
        <div className="mt-2 text-3xl font-semibold text-fg-strong">{value}</div>
        <div className="mt-1 text-xs text-fg-muted">{helper}</div>
      </CardContent>
    </Card>
  );
}

function RosterRow({ member, selected, onSelect }: { member: TeamMember; selected: boolean; onSelect: () => void }) {
  const availability = parsePercent(member.availability);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={selected ? "w-full rounded-xl border border-accent bg-accent-soft p-4 text-left transition" : "w-full rounded-xl border border-hairline bg-surface-2 p-4 text-left transition hover:border-hairline-hi hover:bg-surface-3"}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_140px] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={member.name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg-strong">{member.name}</div>
            <div className="mt-1 truncate text-xs text-fg-muted">{member.role}</div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-fg-muted">{member.assignment}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {member.skills.slice(0, 3).map((skill) => <Badge key={skill}>{skill}</Badge>)}
            {member.skills.length > 3 && <Badge>+{member.skills.length - 3}</Badge>}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <ReadinessBadge value={member.aiReadiness} />
            <span className="font-mono text-xs text-fg-muted">{availability}%</span>
          </div>
          <Progress value={availability} className="mt-2 h-1.5 bg-surface-1" />
        </div>
      </div>
    </button>
  );
}

function MemberDetail({
  member,
  setTeam,
  onDelete,
}: {
  member: TeamMember | null;
  setTeam: Dispatch<SetStateAction<TeamMember[]>>;
  onDelete: (id: string) => void;
}) {
  if (!member) {
    return (
      <Card>
        <CardContent className="grid min-h-96 place-items-center p-6 text-center">
          <div>
            <div className="text-sm font-semibold text-fg-strong">Select a resource</div>
            <p className="mt-1 text-sm text-fg-muted">Edit role, capacity, skills, and assignment from the detail panel.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="xl:sticky xl:top-20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={member.name} large />
            <div className="min-w-0">
              <CardTitle className="truncate">{member.name}</CardTitle>
              <p className="mt-1 truncate text-sm text-fg-muted">{member.role}</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" aria-label={`Remove ${member.name}`} onClick={() => onDelete(member.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <Editable label="Name" value={member.name} onChange={(value) => updateMember(setTeam, member.id, { name: value })} />
          <Editable label="Role" value={member.role} onChange={(value) => updateMember(setTeam, member.id, { role: value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Editable label="Experience" value={member.experience} onChange={(value) => updateMember(setTeam, member.id, { experience: value })} />
          <Editable label="Availability" value={member.availability} onChange={(value) => updateMember(setTeam, member.id, { availability: value })} />
        </div>
        <label className="grid gap-1.5">
          <span className="text-xs text-fg-muted">AI readiness</span>
          <select className="h-9 rounded-lg border border-hairline bg-surface-1 px-2 text-sm text-fg outline-none focus:border-accent" value={member.aiReadiness} onChange={(event) => updateMember(setTeam, member.id, { aiReadiness: event.target.value as TeamMember["aiReadiness"] })}>
            <option value="advanced">advanced</option>
            <option value="active">active</option>
            <option value="learning">learning</option>
          </select>
        </label>
        <Editable label="Assignment" value={member.assignment} onChange={(value) => updateMember(setTeam, member.id, { assignment: value })} />
        <Editable label="Skills" value={member.skills.join(", ")} onChange={(value) => updateMember(setTeam, member.id, { skills: normalizeSkills(value) })} />
        <Separator />
        <div>
          <div className="mb-2 text-xs text-fg-muted">Skill coverage</div>
          <div className="flex flex-wrap gap-2">
            {member.skills.length ? member.skills.map((skill) => <Badge key={skill}>{skill}</Badge>) : <span className="text-sm text-fg-muted">No skills set.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg">Capacity</span>
            <span className="font-mono text-sm text-fg-strong">{parsePercent(member.availability)}%</span>
          </div>
          <Progress value={parsePercent(member.availability)} className="mt-3" />
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestedResource({ resource, onAdd }: { resource: AllocatedResource; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg-strong">{resource.name}</div>
          <div className="mt-1 truncate text-xs text-fg-muted">{resource.title || resource.resource_type.replace(/_/g, " ")}</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <UserRoundPlus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        {Math.round(resource.allocation_percentage * 100)}% suggested allocation
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {resource.skills.slice(0, 4).map((skill) => <Badge key={skill}>{skill}</Badge>)}
      </div>
    </div>
  );
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={large ? "grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-hairline bg-surface-2 font-semibold text-accent" : "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-hairline bg-surface-1 font-semibold text-accent"}>
      {initials}
    </div>
  );
}

function ReadinessBadge({ value }: { value: TeamMember["aiReadiness"] }) {
  const cls = value === "advanced"
    ? "border-accent/30 bg-accent-soft text-accent"
    : value === "active"
      ? "border-hairline bg-surface-1 text-fg"
      : "border-warn/30 bg-surface-1 text-warn";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{value}</span>;
}

function Editable({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function normalizeSkills(value: string) {
  return value.split(",").map((skill) => skill.trim()).filter(Boolean);
}

function parsePercent(value: string) {
  const num = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function readTeam() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as TeamMember[] : initialTeam;
  } catch {
    return initialTeam;
  }
}

function updateMember(setTeam: Dispatch<SetStateAction<TeamMember[]>>, id: string, patch: Partial<TeamMember>) {
  setTeam((current) => current.map((member) => member.id === id ? { ...member, ...patch } : member));
}
