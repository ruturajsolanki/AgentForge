import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi } from "./helpers/api";

const NOTIFS = {
  unread_count: 2,
  items: [
    { id: "n1", kind: "approval_needed", title: "Demand DMD-1 awaiting approval", body: "Review needed", read: false, created_at: "2026-06-01T00:00:00Z" },
    { id: "n2", kind: "handoff", title: "Task handoff: build auth", body: "Assigned to you", read: false, created_at: "2026-06-01T00:00:00Z" },
  ],
};

test.describe("Notification bell", () => {
  test("shows unread badge and lists notifications", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, { "/api/notifications": NOTIFS });

    await page.goto("/demands");
    const badge = page.getByTestId("notification-badge");
    await expect(badge).toHaveText("2");

    await page.getByTestId("notification-bell").click();
    await expect(page.getByText("Demand DMD-1 awaiting approval")).toBeVisible();
    await expect(page.getByText("Task handoff: build auth")).toBeVisible();
  });

  test("mark all read clears the unread badge", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, {
      "/api/notifications": NOTIFS,
      "/api/notifications/read-all": { ok: true, unread_count: 0 },
    });

    await page.goto("/demands");
    await expect(page.getByTestId("notification-badge")).toHaveText("2");
    await page.getByTestId("notification-bell").click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByTestId("notification-badge")).toHaveCount(0);
  });
});
