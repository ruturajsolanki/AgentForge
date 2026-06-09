import type { Page } from "@playwright/test";

export type Role =
  | "client"
  | "viewer"
  | "contributor"
  | "member"
  | "delivery_team"
  | "leader"
  | "middleware"
  | "manager"
  | "higher_manager"
  | "executive";

const SESSION_KEY = "forgeos.session";

const NAMES: Record<Role, { name: string; company: string }> = {
  client: { name: "Client Demo", company: "DemoCo Retail" },
  viewer: { name: "Audit Viewer", company: "ForgeOS Delivery" },
  contributor: { name: "Dev Contributor", company: "ForgeOS Delivery" },
  member: { name: "Ravi Kumar", company: "ForgeOS Delivery" },
  delivery_team: { name: "Delivery Ops", company: "ForgeOS Delivery" },
  leader: { name: "Sneha Patel", company: "ForgeOS Delivery" },
  middleware: { name: "Middleware Ops", company: "ForgeOS Delivery" },
  manager: { name: "Manager Demo", company: "ForgeOS Delivery" },
  higher_manager: { name: "VP Delivery", company: "ForgeOS Delivery" },
  executive: { name: "CTO Executive", company: "ForgeOS Delivery" },
};

/**
 * Seed a logged-in session directly into localStorage — the exact shape
 * `login()` writes. This bypasses the custom login form (whose inputs/buttons
 * lack the standard email/submit attributes) and is the most reliable auth
 * path for E2E.
 */
export async function loginAs(page: Page, role: Role): Promise<void> {
  const info = NAMES[role];
  const session = {
    email: `${role}@forgeos.demo`,
    name: info.name,
    company: info.company,
    role,
    roles: [role],
    signedInAt: new Date().toISOString(),
  };
  // addInitScript runs before any app code on every navigation in this context.
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [SESSION_KEY, JSON.stringify(session)],
  );
}
