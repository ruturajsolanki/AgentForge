import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi } from "./helpers/api";

test.describe("TCS Delivery Layer Happy Path", () => {
  test("manager can access the manager console", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page);
    await page.goto("/dashboard/manager");
    await expect(page.locator("h1")).toContainText("Manager Console");
  });

  test("higher_manager sees sanitized portfolio without risk leaks", async ({ page }) => {
    await loginAs(page, "higher_manager");
    await mockApi(page);
    await page.goto("/dashboard/higher-manager");
    await expect(page.locator("h1")).toContainText("Portfolio Overview");
    const body = (await page.textContent("body")) || "";
    expect(body).not.toContain("risk_factors");
    expect(body).not.toContain("failure rate");
  });

  test("leader can view team execution board", async ({ page }) => {
    await loginAs(page, "leader");
    await mockApi(page);
    await page.goto("/dashboard/leader");
    await expect(page.locator("h1")).toContainText("Team Execution");
  });

  test("member can view their work", async ({ page }) => {
    await loginAs(page, "member");
    await mockApi(page);
    await page.goto("/dashboard/member");
    await expect(page.locator("h1")).toContainText("My Work");
  });

  test("delivery component gallery renders all components", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page);
    await page.goto("/dev/delivery");
    await expect(page.locator("h1")).toContainText("Delivery Component Gallery");
    await expect(page.getByRole("heading", { name: "SWON Badge", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "WON Badge", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Task Board (Kanban)", exact: true })).toBeVisible();
  });

  test("reports page is accessible by manager", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page);
    await page.goto("/reports");
    await expect(page.locator("h1")).toContainText("Reports");
  });
});
