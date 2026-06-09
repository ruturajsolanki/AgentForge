import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi } from "./helpers/api";

const CLARIFY = {
  questions: [
    {
      id: "q1",
      question: "Who are the primary users of this system?",
      why: "User roles shape the access model.",
      category: "users",
      options: ["Admin + End Users (2 roles)", "Admin + Manager + End User (3 roles)", "Complex hierarchy with 4+ roles"],
    },
  ],
  completeness_score: 0.4,
};

test.describe("Manager demand wizard", () => {
  test("step 1 -> clarify chat shows AI questions with selectable options", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, {
      "/api/demands/clarify": CLARIFY,
      "/api/demands/converse": {
        message: "Got it — admin and end users.",
        follow_up_questions: [],
        ready_for_plan: true,
        completeness_score: 0.85,
      },
    });

    await page.goto("/demand/new");
    await expect(page.locator("h1")).toContainText("What should ForgeOS build?");

    await page.locator("textarea").first().fill(
      "Build a customer support dashboard with auth, analytics and CRM integration.",
    );
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: conversational clarification
    await expect(page.locator("h1")).toContainText("Let's refine your demand");
    await expect(page.getByText("Who are the primary users of this system?")).toBeVisible();

    // Clicking an option submits it directly as the answer (Cursor-plan-mode style).
    const option = page.getByRole("button", { name: "Admin + End Users (2 roles)" });
    await expect(option).toBeVisible();
    await option.click();

    // The chosen option is sent as the user's answer and the AI acknowledges.
    await expect(page.getByText("Admin + End Users (2 roles)").last()).toBeVisible();
    await expect(page.getByText("Got it — admin and end users.")).toBeVisible();
  });

  test("clarity progress bar is shown in the chat step", async ({ page }) => {
    await loginAs(page, "manager");
    await mockApi(page, { "/api/demands/clarify": CLARIFY });
    await page.goto("/demand/new");
    await page.locator("textarea").first().fill("Build an internal analytics tool for the finance team.");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/% clarity/)).toBeVisible();
  });
});
