import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { mockApi } from "./helpers/api";

const CLARIFY = {
  questions: [
    {
      id: "q1",
      question: "Does this need to integrate with existing systems?",
      why: "Integrations affect architecture and timeline.",
      category: "integration",
      options: ["No — standalone system", "Yes, 1-2 APIs (payment, email)", "Yes, multiple systems (ERP, CRM)"],
    },
  ],
  completeness_score: 0.45,
};

test.describe("Client demand intake", () => {
  test("client describes outcome then sees AI clarify chat with options", async ({ page }) => {
    await loginAs(page, "client");
    await mockApi(page, { "/api/demands/clarify": CLARIFY });

    await page.goto("/demand/new");
    await expect(page.locator("h1")).toContainText("What outcome do you need ForgeOS to deliver?");

    await page.locator("textarea").first().fill(
      "We need an online booking platform for our dental clinic with payments and reminders.",
    );
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.locator("h1")).toContainText("Let's refine your request");
    await expect(page.getByText("Does this need to integrate with existing systems?")).toBeVisible();

    const option = page.getByRole("button", { name: "Yes, 1-2 APIs (payment, email)" });
    await expect(option).toBeVisible();
    await option.click();

    const input = page.getByPlaceholder("Pick an option above or type your own answer...");
    await expect(input).toHaveValue(/Yes, 1-2 APIs/);
  });
});
