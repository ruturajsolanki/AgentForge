export type UserRole =
  | "client"
  | "manager"
  | "higher_manager"
  | "executive"
  | "middleware"
  | "leader"
  | "delivery_team"
  | "member"
  | "contributor"
  | "viewer";

export interface DemoUser {
  email: string;
  password: string;
  name: string;
  company: string;
  role: UserRole;
  roles: UserRole[];
}

export interface Session {
  email: string;
  name: string;
  company: string;
  role: UserRole;
  roles: UserRole[];
  signedInAt: string;
}

const KEY = "forgeos.session";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  executive: 6,
  higher_manager: 5,
  manager: 4,
  middleware: 3,
  leader: 2,
  delivery_team: 2,
  member: 1,
  contributor: 1,
  viewer: 0,
  client: 0,
};

export const DEMO_USERS: DemoUser[] = [
  {
    email: "client@forgeos.demo",
    password: "client123",
    name: "Client Demo",
    company: "DemoCo Retail",
    role: "client",
    roles: ["client"],
  },
  {
    email: "viewer@forgeos.demo",
    password: "viewer123",
    name: "Audit Viewer",
    company: "ForgeOS Delivery",
    role: "viewer",
    roles: ["viewer"],
  },
  {
    email: "contributor@forgeos.demo",
    password: "contrib123",
    name: "Dev Contributor",
    company: "ForgeOS Delivery",
    role: "contributor",
    roles: ["contributor"],
  },
  {
    email: "member@forgeos.demo",
    password: "member123",
    name: "Ravi Kumar",
    company: "ForgeOS Delivery",
    role: "member",
    roles: ["member"],
  },
  {
    email: "delivery@forgeos.demo",
    password: "delivery123",
    name: "Delivery Ops",
    company: "ForgeOS Delivery",
    role: "delivery_team",
    roles: ["delivery_team"],
  },
  {
    email: "leader@forgeos.demo",
    password: "leader123",
    name: "Sneha Patel",
    company: "ForgeOS Delivery",
    role: "leader",
    roles: ["leader"],
  },
  {
    email: "middleware@forgeos.demo",
    password: "middleware123",
    name: "Middleware Ops",
    company: "ForgeOS Delivery",
    role: "middleware",
    roles: ["middleware"],
  },
  {
    email: "manager@forgeos.demo",
    password: "manager123",
    name: "Manager Demo",
    company: "ForgeOS Delivery",
    role: "manager",
    roles: ["manager"],
  },
  {
    email: "hm@forgeos.demo",
    password: "hm123",
    name: "VP Delivery",
    company: "ForgeOS Delivery",
    role: "higher_manager",
    roles: ["higher_manager"],
  },
  {
    email: "exec@forgeos.demo",
    password: "exec123",
    name: "CTO Executive",
    company: "ForgeOS Delivery",
    role: "executive",
    roles: ["executive"],
  },
];

export function getSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.roles) parsed.roles = [parsed.role];
    return parsed;
  } catch {
    return null;
  }
}

export function login(email: string, password: string): Session | null {
  const user = DEMO_USERS.find(
    (item) =>
      item.email === email.trim().toLowerCase() && item.password === password
  );
  if (!user) return null;
  const session: Session = {
    email: user.email,
    name: user.name,
    company: user.company,
    role: user.role,
    roles: user.roles,
    signedInAt: new Date().toISOString(),
  };
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("forgeos.session"));
  return session;
}

export function loginAs(role: UserRole): Session {
  const user = DEMO_USERS.find((item) => item.role === role)!;
  return login(user.email, user.password)!;
}

export function logout() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("forgeos.session"));
}

export function hasRole(session: Session | null, slug: UserRole): boolean {
  if (!session) return false;
  return session.roles.includes(slug);
}

export function maxHierarchy(session: Session | null): number {
  if (!session) return 0;
  return Math.max(...session.roles.map((r) => ROLE_HIERARCHY[r] ?? 0));
}

export function defaultDashboard(session: Session | null): string {
  if (!session) return "/login";
  const top = session.roles.reduce(
    (best, r) =>
      (ROLE_HIERARCHY[r] ?? 0) > (ROLE_HIERARCHY[best] ?? 0) ? r : best,
    session.roles[0]
  );
  const map: Record<string, string> = {
    executive: "/dashboard/executive",
    higher_manager: "/dashboard/higher-manager",
    manager: "/dashboard/manager",
    middleware: "/dashboard/middleware",
    leader: "/dashboard/leader",
    delivery_team: "/dashboard/delivery",
    member: "/dashboard/member",
    contributor: "/dashboard/contributor",
    viewer: "/dashboard/viewer",
    client: "/client",
  };
  return map[top] || "/demands";
}
