import {
  BarChart3,
  ClipboardList,
  GitBranch,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings,
  Shield,
  SplitSquareVertical,
  UserCircle,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { Session, UserRole } from "./auth";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Workflow;
}

export interface RoleMeta {
  label: string;
  tagline: string;
  description: string;
  hierarchy: number;
  landing: string;
  capabilities: string[];
}

const PROFILE_NAV: NavItem = { href: "/profile", label: "Profile", icon: UserCircle };

export const ROLE_META: Record<UserRole, RoleMeta> = {
  executive: {
    label: "Executive",
    tagline: "Org-wide delivery health",
    description: "C-suite oversight across the whole portfolio with KPI rollups and trends.",
    hierarchy: 6,
    landing: "/dashboard/executive",
    capabilities: ["View org KPIs & trends", "Access all reports", "See every demand & SWON"],
  },
  higher_manager: {
    label: "Higher Manager",
    tagline: "Sanitized portfolio overview",
    description: "Senior delivery leadership seeing a clean, sanitized portfolio (no risk/failure noise).",
    hierarchy: 5,
    landing: "/dashboard/higher-manager",
    capabilities: ["Sanitized portfolio", "Delivery & SWON reports", "Approve SWON/WON"],
  },
  manager: {
    label: "Manager",
    tagline: "Plan review & approvals",
    description: "Owns demand review, plan approval, team edits, and client communication.",
    hierarchy: 4,
    landing: "/dashboard/manager",
    capabilities: ["Approve plans", "Edit team & pipeline", "Chat with AI & client", "Share live link"],
  },
  middleware: {
    label: "Middleware",
    tagline: "Intake & handoffs",
    description: "Routes incoming demands and manages handoffs between intake and delivery.",
    hierarchy: 3,
    landing: "/dashboard/middleware",
    capabilities: ["Approve intake", "Route demands", "Create tasks"],
  },
  leader: {
    label: "Team Leader",
    tagline: "Squad execution",
    description: "Runs the delivery squad: task board, blockers, SLA risk and member progress.",
    hierarchy: 2,
    landing: "/dashboard/leader",
    capabilities: ["Manage task board", "Resolve blockers", "Create & assign tasks"],
  },
  delivery_team: {
    label: "Delivery Team",
    tagline: "Squad throughput",
    description: "Cross-functional delivery squad tracking active demands and task throughput.",
    hierarchy: 2,
    landing: "/dashboard/delivery",
    capabilities: ["View squad demands", "Update task status", "Create tasks"],
  },
  member: {
    label: "Team Member",
    tagline: "My work",
    description: "Individual contributor focused on their assigned tasks.",
    hierarchy: 1,
    landing: "/dashboard/member",
    capabilities: ["View my tasks", "Update status", "Comment & hand off"],
  },
  contributor: {
    label: "Contributor",
    tagline: "My contributions",
    description: "Hands-on contributor tracking their tasks and code commits.",
    hierarchy: 1,
    landing: "/dashboard/contributor",
    capabilities: ["View my tasks", "Track my commits", "Update status"],
  },
  viewer: {
    label: "Viewer",
    tagline: "Read-only insight",
    description: "Read-only stakeholder with access to portfolio and audit history.",
    hierarchy: 0,
    landing: "/dashboard/viewer",
    capabilities: ["Read-only portfolio", "View audit history"],
  },
  client: {
    label: "Client",
    tagline: "Submit & track demands",
    description: "External client submitting demands and following live progress.",
    hierarchy: 0,
    landing: "/client",
    capabilities: ["Submit demands", "Chat with AI", "Follow live progress"],
  },
};

const MANAGER_NAV: NavItem[] = [
  { href: "/demands", label: "Demands", icon: Workflow },
  { href: "/requests", label: "Requests", icon: Inbox },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit", label: "Audit", icon: ClipboardList },
  { href: "/models", label: "Models", icon: SplitSquareVertical },
  { href: "/settings", label: "Settings", icon: Settings },
];

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  executive: [
    { href: "/dashboard/executive", label: "Dashboard", icon: LayoutDashboard },
    { href: "/demands", label: "Demands", icon: Workflow },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/audit", label: "Audit", icon: ClipboardList },
  ],
  higher_manager: [
    { href: "/dashboard/higher-manager", label: "Dashboard", icon: LayoutDashboard },
    { href: "/demands", label: "Demands", icon: Workflow },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/audit", label: "Audit", icon: ClipboardList },
  ],
  manager: [
    { href: "/dashboard/manager", label: "Dashboard", icon: LayoutDashboard },
    ...MANAGER_NAV,
  ],
  middleware: [
    { href: "/dashboard/middleware", label: "Dashboard", icon: LayoutDashboard },
    { href: "/demands", label: "Demands", icon: Workflow },
    { href: "/requests", label: "Requests", icon: Inbox },
    { href: "/audit", label: "Audit", icon: ClipboardList },
  ],
  leader: [
    { href: "/dashboard/leader", label: "Dashboard", icon: LayoutDashboard },
    { href: "/demands", label: "Demands", icon: Workflow },
    { href: "/team", label: "Team", icon: UsersRound },
  ],
  delivery_team: [
    { href: "/dashboard/delivery", label: "Dashboard", icon: LayoutDashboard },
    { href: "/demands", label: "Demands", icon: Workflow },
    { href: "/team", label: "Team", icon: UsersRound },
  ],
  member: [
    { href: "/dashboard/member", label: "My Work", icon: ListChecks },
    { href: "/demands", label: "Demands", icon: Workflow },
  ],
  contributor: [
    { href: "/dashboard/contributor", label: "My Work", icon: GitBranch },
    { href: "/demands", label: "Demands", icon: Workflow },
  ],
  viewer: [
    { href: "/dashboard/viewer", label: "Portfolio", icon: LayoutDashboard },
    { href: "/audit", label: "Audit", icon: Shield },
  ],
  client: [],
};

export function topRole(session: Session | null): UserRole {
  if (!session || !session.roles?.length) return "viewer";
  return session.roles.reduce(
    (best, r) => ((ROLE_META[r]?.hierarchy ?? 0) > (ROLE_META[best]?.hierarchy ?? 0) ? r : best),
    session.roles[0],
  );
}

export function navForSession(session: Session | null): NavItem[] {
  const role = topRole(session);
  const base = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.member;
  return [...base, PROFILE_NAV];
}

export function roleMeta(role: UserRole): RoleMeta {
  return ROLE_META[role] ?? ROLE_META.member;
}
