import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, Save, Trash2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
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

export default function TeamRoute() {
  const [team, setTeam] = useState<TeamMember[]>(() => readTeam());
  const [draft, setDraft] = useState(emptyDraft);
  const [demands, setDemands] = useState<Demand[]>([]);

  useEffect(() => {
    forgeApi.listDemands().then(setDemands).catch(() => setDemands([]));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(KEY, JSON.stringify(team));
  }, [team]);

  const suggested = useMemo(() => {
    const latest = demands.find((demand) => demand.allocation?.team?.length);
    return latest?.allocation?.team || [];
  }, [demands]);

  const addMember = () => {
    if (!draft.name.trim() || !draft.role.trim()) {
      toast.error("Add a name and role");
      return;
    }
    setTeam((current) => [{ ...draft, id: `tm-${Date.now()}`, skills: normalizeSkills(draft.skills.join(",")) }, ...current]);
    setDraft(emptyDraft);
    toast.success("Team member added");
  };

  const addSuggested = (resource: AllocatedResource) => {
    setTeam((current) => [{
      id: `tm-${Date.now()}-${resource.name}`,
      name: resource.name,
      role: resource.title || resource.resource_type.replace(/_/g, " "),
      experience: resource.seniority === "agent" ? "AI agent" : "Not set",
      aiReadiness: resource.seniority === "agent" ? "advanced" : "active",
      availability: `${Math.round(resource.allocation_percentage * 100)}%`,
      skills: resource.skills,
      assignment: "Suggested pool",
    }, ...current]);
    toast.success(`${resource.name} added to team`);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Manager</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg-strong">Team management</h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-fg-muted">
            Manage human team members, AI agents, learning goals, availability, and demand assignments.
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3 text-sm text-fg-muted">
          <span className="font-mono text-fg">{team.length}</span> resources · <span className="font-mono text-fg">{team.filter((m) => m.assignment === "Available").length}</span> available
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="grid gap-3 md:grid-cols-2">
          {team.map((member) => (
            <Card key={member.id}>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Input value={member.name} onChange={(event) => updateMember(setTeam, member.id, { name: event.target.value })} className="border-transparent bg-transparent px-0 text-base font-semibold" />
                    <Input value={member.role} onChange={(event) => updateMember(setTeam, member.id, { role: event.target.value })} className="mt-1 h-7 border-transparent bg-transparent px-0 text-xs text-fg-muted" />
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${member.name}`} onClick={() => setTeam((current) => current.filter((item) => item.id !== member.id))}>
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Editable label="Experience" value={member.experience} onChange={(value) => updateMember(setTeam, member.id, { experience: value })} />
                  <Editable label="Available" value={member.availability} onChange={(value) => updateMember(setTeam, member.id, { availability: value })} />
                  <label className="grid gap-1">
                    <span className="text-xs text-fg-muted">AI readiness</span>
                    <select className="h-9 rounded-lg border border-hairline bg-surface-1 px-2 text-sm text-fg outline-none" value={member.aiReadiness} onChange={(event) => updateMember(setTeam, member.id, { aiReadiness: event.target.value as TeamMember["aiReadiness"] })}>
                      <option value="advanced">advanced</option>
                      <option value="active">active</option>
                      <option value="learning">learning</option>
                    </select>
                  </label>
                </div>
                <Editable label="Assignment" value={member.assignment} onChange={(value) => updateMember(setTeam, member.id, { assignment: value })} />
                <label className="grid gap-1">
                  <span className="text-xs text-fg-muted">Skills</span>
                  <Input value={member.skills.join(", ")} onChange={(event) => updateMember(setTeam, member.id, { skills: normalizeSkills(event.target.value) })} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {member.skills.map((skill) => <Badge key={skill}>{skill}</Badge>)}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add team member</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Editable label="Name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
              <Editable label="Role" value={draft.role} onChange={(value) => setDraft((current) => ({ ...current, role: value }))} />
              <Editable label="Experience" value={draft.experience} onChange={(value) => setDraft((current) => ({ ...current, experience: value }))} />
              <Editable label="Availability" value={draft.availability} onChange={(value) => setDraft((current) => ({ ...current, availability: value }))} />
              <Editable label="Skills" value={draft.skills.join(", ")} onChange={(value) => setDraft((current) => ({ ...current, skills: normalizeSkills(value) }))} />
              <Button className="w-full" variant="primary" onClick={addMember}>
                <Plus className="h-4 w-4" />
                Add member
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Suggested team from AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {suggested.length ? suggested.slice(0, 6).map((resource) => (
                <div key={`${resource.name}-${resource.resource_type}`} className="rounded-xl border border-hairline bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-fg-strong">{resource.name}</div>
                      <div className="mt-1 text-xs text-fg-muted">{resource.title || resource.resource_type.replace(/_/g, " ")}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => addSuggested(resource)}>
                      <UserRoundPlus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {resource.skills.slice(0, 4).map((skill) => <Badge key={skill}>{skill}</Badge>)}
                  </div>
                </div>
              )) : (
                <p className="text-sm text-fg-muted">Create or load a demand to see AI-suggested resources.</p>
              )}
            </CardContent>
          </Card>

          <Button variant="secondary" className="w-full" onClick={() => toast.success("Team saved locally")}>
            <Save className="h-4 w-4" />
            Save team
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Editable({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function normalizeSkills(value: string) {
  return value.split(",").map((skill) => skill.trim()).filter(Boolean);
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
