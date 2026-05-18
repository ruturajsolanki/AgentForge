import type { Demand, SimilarProject } from "../types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const forgeApi = {
  createDemand: (text: string) =>
    api<{
      demand_id: string;
      stage: string;
      understanding: Demand["understanding"];
      decision: Demand["decision"];
      allocation: Demand["allocation"];
      similar_projects: { matches: SimilarProject[] };
      reuse_score: number;
    }>("/api/demands", { method: "POST", body: JSON.stringify({ text }) }),

  approveDemand: (publicId: string) =>
    api<{ demand_id: string; stage: string }>(
      `/api/demands/${publicId}/approve`,
      { method: "POST", body: JSON.stringify({ approve: true }) },
    ),

  getDemand: (publicId: string) =>
    api<Demand & { agent_runs?: unknown[] }>(`/api/demands/${publicId}`),

  listDemands: () => api<Demand[]>("/api/demands"),

  getSettings: () => api<Record<string, unknown>>("/api/settings"),

  updateSettings: (body: Record<string, unknown>) =>
    api<Record<string, unknown>>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
