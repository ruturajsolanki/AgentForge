import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi } from "./helpers/api";

test.describe("Personal profile page", () => {
  test("manager profile shows identity, role and demands panel", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page);
    await page.goto("/profile");

    await expect(page.locator("h1")).toContainText("Profile");
    await expect(page.getByTestId("profile-role")).toHaveText("Manager");
    await expect(page.getByText("Manager Demo")).toBeVisible();
    await expect(page.getByText("manager@forgeos.demo")).toBeVisible();
    await expect(page.getByText("Demands In View", { exact: false })).toBeVisible();
  });

  test("member profile shows tasks panel and correct role", async ({ page }) => {
    await loginAs(page, "member");
    await mockApi(page);
    await page.goto("/profile");
    await expect(page.getByTestId("profile-role")).toHaveText("Team Member");
    await expect(page.getByRole("heading", { name: /My Tasks/ })).toBeVisible();
  });

  test("viewer profile shows read-only capabilities", async ({ page }) => {
    await loginAs(page, "viewer");
    await mockApi(page);
    await page.goto("/profile");
    await expect(page.getByTestId("profile-role")).toHaveText("Viewer");
    await expect(page.getByText("Read-only portfolio")).toBeVisible();
  });

  test("profile link in the header navigates to /profile", async ({ page }) => {
    await loginAs(page, "leader");
    await mockApi(page);
    await page.goto("/dashboard/leader");
    await page.getByTestId("profile-link").click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator("h1")).toContainText("Profile");
  });
});
