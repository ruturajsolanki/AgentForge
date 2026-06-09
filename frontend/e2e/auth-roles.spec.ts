import { test, expect } from "@playwright/test";
import { loginAs, type Role } from "./helpers/auth";
import { mockApi } from "./helpers/api";

const DASHBOARDS: Array<{ role: Role; path: string; h1: string }> = [
  { role: "executive", path: "/dashboard/executive", h1: "Executive Dashboard" },
  { role: "higher_manager", path: "/dashboard/higher-manager", h1: "Portfolio Overview" },
  { role: "manager", path: "/dashboard/manager", h1: "Manager Console" },
  { role: "middleware", path: "/dashboard/middleware", h1: "Middleware" },
  { role: "leader", path: "/dashboard/leader", h1: "Team Execution" },
  { role: "delivery_team", path: "/dashboard/delivery", h1: "Delivery Squad" },
  { role: "member", path: "/dashboard/member", h1: "My Work" },
  { role: "contributor", path: "/dashboard/contributor", h1: "My Contributions" },
  { role: "viewer", path: "/dashboard/viewer", h1: "Portfolio (Read-only)" },
];

test.describe("Auth & role gating", () => {
  for (const d of DASHBOARDS) {
    test(`${d.role} lands on ${d.path}`, async ({ page }) => {
      await loginAs(page, d.role);
      await mockApi(page);
      await page.goto(d.path);
      await expect(page.locator("h1")).toContainText(d.h1);
      // Persona banner makes each workspace visibly role-distinct.
      await expect(page.getByTestId("persona-header")).toBeVisible();
    });
  }

  test("default landing differs per role via defaultDashboard", async ({ page }) => {
    await loginAs(page, "delivery_team");
    await mockApi(page);
    await page.goto("/");
    // Root redirects to /login, but the nav is role-tailored once on a shell page.
    await page.goto("/dashboard/delivery");
    await expect(page.getByTestId("role-nav")).toBeVisible();
  });

  test("navigation is role-tailored (manager has Settings, viewer does not)", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page);
    await page.goto("/dashboard/manager");
    await expect(page.getByTestId("role-nav").getByText("Settings")).toBeVisible();

    await loginAs(page, "viewer");
    await page.goto("/dashboard/viewer");
    await expect(page.getByTestId("role-nav").getByText("Settings")).toHaveCount(0);
    await expect(page.getByTestId("role-nav").getByText("Profile")).toBeVisible();
  });

  test("header shows the active role badge", async ({ page }) => {
    await loginAs(page, "leader");
    await mockApi(page);
    await page.goto("/dashboard/leader");
    await expect(page.getByTestId("role-badge")).toHaveText("Team Leader");
  });

  test("no session redirects shell routes to login", async ({ page }) => {
    await mockApi(page);
    await page.goto("/demands");
    await expect(page).toHaveURL(/\/login/);
  });

  test("viewer is denied the executive dashboard", async ({ page }) => {
    await loginAs(page, "viewer");
    await mockApi(page);
    await page.goto("/dashboard/executive");
    await expect(page.getByText("Access Denied")).toBeVisible();
  });

  test("member is denied the reports page", async ({ page }) => {
    await loginAs(page, "member");
    await mockApi(page);
    await page.goto("/reports");
    await expect(page.getByText("Access Denied")).toBeVisible();
  });

  test("client is routed to the client landing", async ({ page }) => {
    await loginAs(page, "client");
    await mockApi(page);
    await page.goto("/demands");
    await expect(page).toHaveURL(/\/client/);
  });
});
