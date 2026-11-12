import { expect, test } from "@playwright/test";

test.describe("Demo Mode journey", () => {
  test("dashboard, invoices, insights and settings load with demo labelling", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Demo Bistro/ })).toBeVisible();
    await expect(page.getByText("Recorded invoice expenses")).toBeVisible();
    await expect(page.getByText("Packaging expenses increased 18%").first()).toBeVisible();
    await expect(
      page.getByRole("img", { name: /monthly recorded invoice expenses/i }),
    ).toBeVisible();

    await page.goto("/invoices");
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload PDF/ })).toBeDisabled();
    await page.getByLabel("Search").fill("Northwind");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/q=Northwind/);
    await expect(page.getByRole("link", { name: "Northwind Produce" }).first()).toBeVisible();

    await page.goto("/insights");
    await expect(page.getByText(/Possible duplicate invoice/)).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByText("Demo — not connected")).toBeVisible();
  });

  test("flagged invoice shows checks and links to the related record", async ({ page }) => {
    await page.goto("/invoices?status=needs_review");
    await page.getByRole("link", { name: "Northwind Produce" }).first().click();
    await expect(page.getByText("This may duplicate an existing invoice.")).toBeVisible();
    await expect(page.getByRole("link", { name: "View related invoice" })).toBeVisible();
  });

  test("Forecast Studio recalculates instantly without network calls", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Forecast Studio" }).click();
    const dialog = page.getByRole("dialog", { name: "Forecast Studio" });
    await expect(dialog).toBeVisible();

    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await dialog.getByLabel(/Monthly expense baseline/).fill("1000");
    await dialog.getByLabel("Expected monthly expense change (%)").fill("10");
    await dialog.getByRole("radio", { name: "3 months" }).click();

    // 1100 + 1210 + 1331 = 3641 ; flat 3000 ; difference +641
    await expect(dialog.getByTestId("kpi-cumulative")).toHaveText("$3,641");
    await expect(dialog.getByTestId("kpi-final")).toHaveText("$1,331");
    await expect(dialog.getByTestId("kpi-diff")).toHaveText("+$641");
    await expect(dialog.getByTestId("kpi-pct")).toHaveText("+21.4%");

    await dialog.getByRole("radio", { name: "12 months" }).click();
    await expect(dialog.getByText("Month 12 projected")).toBeVisible();

    await dialog.getByLabel("Expected monthly expense change (%)").fill("99");
    await expect(dialog.getByRole("alert")).toContainText("between -10% and +15%");
    expect(requests.filter((u) => !u.includes("_next") && !u.includes("_rsc"))).toEqual([]);
  });

  test("mobile navigation works", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile viewport only");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: "Invoices", exact: true }).click();
    await expect(page).toHaveURL(/\/invoices/);
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  });
});
