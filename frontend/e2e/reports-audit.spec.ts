import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi } from "./helpers/api";

const DELIVERY_REPORT = {
  swon_count: 4, won_count: 6, total_value_inr: 12000000,
  demands_delivered: 6, avg_delivery_days: 22, rows: [],
};

test.describe("Reports & Audit", () => {
  test("manager sees reports with export buttons and tabs", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, { "/api/reports/delivery": DELIVERY_REPORT });

    await page.goto("/reports");
    await expect(page.locator("h1")).toContainText("Reports");
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Team Performance" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SLA Compliance" })).toBeVisible();
  });

  test("audit history page renders", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, {
      "/api/audit": {
        items: [
          { id: "a1", entity_kind: "demand", entity_id: "DMD-1", action: "stage_changed", actor_id: null, diff: {}, reason: null, created_at: "2026-06-01T00:00:00Z" },
        ],
        total: 1, limit: 50, offset: 0, has_more: false,
      },
    });

    await page.goto("/audit");
    await expect(page.locator("h1")).toContainText("Audit History");
  });
});
