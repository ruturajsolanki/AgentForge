import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi, SAMPLE_DEMAND } from "./helpers/api";

const PID = SAMPLE_DEMAND.public_id; // DMD-DEMO01

const COMMITS = {
  items: [
    { id: "c1", sha: "deadbeefcafe", author: "Dev One", message: "Implement login form", files_changed: 4, branch: "main", is_agent: false, created_at: "2026-06-01T00:00:00Z" },
  ],
};

function deliveryMocks(extra = {}) {
  return {
    [`/api/demands/${PID}/commits`]: COMMITS,
    [`/api/demands/${PID}`]: SAMPLE_DEMAND,
    ...extra,
  };
}

test.describe("Demand delivery view", () => {
  test("renders pipeline, KPIs and commit timeline", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, deliveryMocks());

    await page.goto(`/demand/${PID}/delivery`);
    await expect(page.getByText("Delivery Pipeline")).toBeVisible();

    await page.getByRole("button", { name: "commits" }).click();
    await expect(page.getByText("Implement login form")).toBeVisible();
    await expect(page.getByText(/Dev One/)).toBeVisible();
  });

  test("share live link dialog sends to client", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, deliveryMocks({
      [`/api/demands/${PID}/share-link`]: {
        status: "ok",
        preview_url: "http://localhost:5173/demand/DMD-DEMO01/preview",
        email: { id: "e1", to: "client@acme.com", delivered: true, provider: "demo" },
      },
    }));

    await page.goto(`/demand/${PID}/delivery`);
    await page.getByTestId("share-live-link").click();
    await expect(page.getByTestId("share-email-input")).toBeVisible();

    await page.getByTestId("share-email-input").fill("client@acme.com");
    await page.getByTestId("share-send").click();

    // On success the dialog closes.
    await expect(page.getByTestId("share-email-input")).toHaveCount(0);
  });
});
