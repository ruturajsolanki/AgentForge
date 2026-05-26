export type UserRole = "client" | "manager";

export interface DemoUser {
  email: string;
  password: string;
  name: string;
  company: string;
  role: UserRole;
}

export interface Session {
  email: string;
  name: string;
  company: string;
  role: UserRole;
  signedInAt: string;
}

const KEY = "forgeos.session";

export const DEMO_USERS: DemoUser[] = [
  {
    email: "client@forgeos.demo",
    password: "client123",
    name: "Client Demo",
    company: "DemoCo Retail",
    role: "client",
  },
  {
    email: "manager@forgeos.demo",
    password: "manager123",
    name: "Manager Demo",
    company: "ForgeOS Delivery",
    role: "manager",
  },
];

export function getSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Session : null;
  } catch {
    return null;
  }
}

export function login(email: string, password: string): Session | null {
  const user = DEMO_USERS.find((item) => item.email === email.trim().toLowerCase() && item.password === password);
  if (!user) return null;
  const session: Session = {
    email: user.email,
    name: user.name,
    company: user.company,
    role: user.role,
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
