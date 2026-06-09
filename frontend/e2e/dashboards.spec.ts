import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi } from "./helpers/api";

test.describe("Role dashboards render KPIs", () => {
  test("executive dashboard", async ({ page }) => {
    await loginAs(page, "executive");
    await mockApi(page);
    await page.goto("/dashboard/executive");
    await expect(page.locator("h1")).toContainText("Executive Dashboard");
  });

  test("higher-manager portfolio is sanitized (no risk/failure leak)", async ({ page }) => {
    await loginAs(page, "higher_manager");
    await mockApi(page);
    await page.goto("/dashboard/higher-manager");
    await expect(page.locator("h1")).toContainText("Portfolio Overview");
    const body = (await page.textContent("body")) || "";
    expect(body).not.toContain("risk_factors");
    expect(body).not.toContain("failure rate");
  });

  test("manager console", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page);
    await page.goto("/dashboard/manager");
    await expect(page.locator("h1")).toContainText("Manager Console");
  });

  test("middleware intake", async ({ page }) => {
    await loginAs(page, "middleware");
    await mockApi(page);
    await page.goto("/dashboard/middleware");
    await expect(page.locator("h1")).toContainText("Middleware");
  });

  test("leader execution", async ({ page }) => {
    await loginAs(page, "leader");
    await mockApi(page);
    await page.goto("/dashboard/leader");
    await expect(page.locator("h1")).toContainText("Team Execution");
  });

  test("member work", async ({ page }) => {
    await loginAs(page, "member");
    await mockApi(page);
    await page.goto("/dashboard/member");
    await expect(page.locator("h1")).toContainText("My Work");
  });
});
