import type { Demand, PortalRequest, PortalTeamMember, SimilarProject } from "../types";

const DEFAULT_TIMEOUT_MS = 30000;
const INTAKE_TIMEOUT_MS = 12000;

async function api<T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...init,
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  why: string;
  category: string;
  options?: string[];
}

export interface ClarificationResult {
  questions: ClarificationQuestion[];
  completeness_score: number;
}

export interface ConverseResult {
  message: string;
  follow_up_questions: ClarificationQuestion[];
  ready_for_plan: boolean;
  completeness_score: number;
}

export interface ClarificationAnswer {
  question_id: string;
  question: string;
  answer: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  entity_kind?: string | null;
  entity_id?: string | null;
  read: boolean;
  created_at?: string | null;
}

export interface NotificationList {
  items: NotificationItem[];
  unread_count: number;
}

export interface CommitItem {
  id: string;
  sha: string;
  author: string;
  message: string;
  files_changed: number;
  branch: string;
  is_agent: boolean;
  created_at?: string | null;
}

export interface EmailItem {
  id: string;
  to: string;
  subject: string;
  body: string;
  kind: string;
  provider: string;
  delivered: boolean;
  created_at?: string | null;
}

export const forgeApi = {
  clarifyDemand: (text: string) =>
    api<ClarificationResult>("/api/demands/clarify", {
      method: "POST",
      body: JSON.stringify({ text }),
    }, DEFAULT_TIMEOUT_MS),

  converseDemand: (
    text: string,
    history: Array<{ role: string; content: string }>,
    message: string,
  ) =>
    api<ConverseResult>("/api/demands/converse", {
      method: "POST",
      body: JSON.stringify({ text, history, message }),
    }, DEFAULT_TIMEOUT_MS),

  createDemand: (text: string, clarifications?: ClarificationAnswer[]) =>
    api<{
      demand_id: string;
      stage: string;
      understanding: Demand["understanding"];
      decision: Demand["decision"];
      allocation: Demand["allocation"];
      similar_projects: { matches: SimilarProject[] } | SimilarProject[];
      reuse_score: number;
    }>("/api/demands", {
      method: "POST",
      body: JSON.stringify({ text, clarifications: clarifications?.length ? clarifications : undefined }),
    }),

  approveDemand: (publicId: string) =>
    api<{ demand_id: string; stage: string }>(
      `/api/demands/${publicId}/approve`,
      { method: "POST", body: JSON.stringify({ approve: true }) },
    ),

  managerChat: (
    publicId: string,
    body: { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> },
  ) =>
    api<{ response: string }>(
      `/api/demands/${publicId}/manager-chat`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      INTAKE_TIMEOUT_MS,
    ),

  getDemand: (publicId: string) =>
    api<Demand & { agent_runs?: unknown[] }>(`/api/demands/${publicId}`),

  listDemands: async (): Promise<Demand[]> => {
    const resp = await api<{ items: Demand[]; total: number } | Demand[]>("/api/demands");
    return Array.isArray(resp) ? resp : resp.items;
  },

  portalListRequests: () => api<PortalRequest[]>("/api/portal/requests"),

  portalCreateRequest: (body: Record<string, unknown>) =>
    api<PortalRequest>("/api/portal/requests", {
      method: "POST",
      body: JSON.stringify(body),
    }, INTAKE_TIMEOUT_MS),

  portalPatchRequest: (id: string, body: Record<string, unknown>) =>
    api<PortalRequest>(`/api/portal/requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  portalAddMessage: (id: string, body: Record<string, unknown>) =>
    api<PortalRequest>(`/api/portal/requests/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  portalAgentChat: (id: string, body: Record<string, unknown>) =>
    api<{ response: string; request: PortalRequest }>(`/api/portal/requests/${id}/agent-chat`, {
      method: "POST",
      body: JSON.stringify(body),
    }, INTAKE_TIMEOUT_MS),

  portalListTeam: () => api<PortalTeamMember[]>("/api/portal/team"),

  portalCreateTeamMember: (body: Record<string, unknown>) =>
    api<PortalTeamMember>("/api/portal/team", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  portalUpdateTeamMember: (id: string, body: Record<string, unknown>) =>
    api<PortalTeamMember>(`/api/portal/team/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getSettings: () => api<Record<string, unknown>>("/api/settings"),

  updateSettings: (body: Record<string, unknown>) =>
    api<Record<string, unknown>>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  listNotifications: (unreadOnly = false) =>
    api<NotificationList>(`/api/notifications?unread_only=${unreadOnly}`),

  markNotificationRead: (id: string) =>
    api<{ ok: boolean; unread_count: number }>(`/api/notifications/${id}/read`, {
      method: "POST",
    }),

  markAllNotificationsRead: () =>
    api<{ ok: boolean; unread_count: number }>("/api/notifications/read-all", {
      method: "POST",
    }),

  listCommits: (publicId: string) =>
    api<{ items: CommitItem[] }>(`/api/demands/${publicId}/commits`),

  addCommit: (publicId: string, body: Record<string, unknown>) =>
    api<CommitItem>(`/api/demands/${publicId}/commits`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listDemandEmails: (publicId: string) =>
    api<{ items: EmailItem[] }>(`/api/demands/${publicId}/emails`),

  shareLiveLink: (publicId: string, body: { client_email: string; link?: string; message?: string }) =>
    api<{ status: string; preview_url: string; email: { id: string; to: string; delivered: boolean; provider: string } }>(
      `/api/demands/${publicId}/share-link`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  updateDemandTeam: (publicId: string, body: { add?: Record<string, unknown>[]; remove?: string[] }) =>
    api<{ status: string; allocation: Demand["allocation"] }>(
      `/api/demands/${publicId}/team`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
};
