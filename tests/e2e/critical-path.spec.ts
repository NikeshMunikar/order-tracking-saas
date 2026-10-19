import { expect, test } from "@playwright/test";

// docs/testing.md §8 critical path:
// Register → Create Business → Add Product → Add Customer → Create Order →
// Copy Tracking URL → Open Tracking URL → Update Order Status →
// Verify Customer Sees New Status.
//
// Every run creates its own data (unique email/business), so the suite is
// re-runnable against the dedicated E2E database without reseeding.

const e2ePassword = "E2EPassword!2026";

function runSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000).toString(36)}`;
}

test("critical path: registration through customer-visible status change", async ({ page }) => {
  const suffix = runSuffix();
  const email = `e2e-${suffix}@example.test`;
  const businessName = `E2E Business ${suffix}`;

  // Register.
  await page.goto("/register");
  await page.getByLabel("Name").fill(`E2E Owner ${suffix}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(e2ePassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Account created" })).toBeVisible();

  // Sign in.
  await page.getByRole("link", { name: "Go to sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(e2ePassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Create business (the create form lives on the dashboard page).
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Currency").fill("USD");
  await page.getByLabel("Timezone").fill("UTC");
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(new RegExp("/dashboard/[^/]+/settings"));
  const businessId = new URL(page.url()).pathname.split("/")[2];
  expect(businessId).toBeTruthy();

  // Add product.
  await page.goto(`/dashboard/${businessId}/products/new`);
  await page.getByLabel("Name").fill("E2E Latte");
  await page.getByLabel("Price").fill("4.50");
  await page.getByRole("button", { name: "Add product" }).click();
  // The create action keeps the /new URL mounted until the client-side push
  // completes; wait for the navigation before asserting the detail URL.
  await expect(page).not.toHaveURL(/\/new$/);
  await expect(page).toHaveURL(new RegExp(`/dashboard/${businessId}/products/[^/]+`));

  // Add customer.
  await page.goto(`/dashboard/${businessId}/customers/new`);
  await page.getByLabel("Name").fill("E2E Customer");
  await page.getByLabel("Phone").fill("+977-9812345678");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page).not.toHaveURL(/\/new$/);
  await expect(page).toHaveURL(new RegExp(`/dashboard/${businessId}/customers/[^/]+`));

  // Create order (delivery type and payment status keep their defaults;
  // delivery recipient fields are required for DELIVERY orders).
  await page.goto(`/dashboard/${businessId}/orders/new`);
  const customerSelect = page.locator("#customerId");
  const customerId = await customerSelect
    .locator("option", { hasText: "E2E Customer" })
    .getAttribute("value");
  expect(customerId).toBeTruthy();
  await customerSelect.selectOption(customerId ?? "");

  const productSelect = page.locator('select[name^="order-item-product-"]').first();
  const productId = await productSelect
    .locator("option", { hasText: "E2E Latte" })
    .getAttribute("value");
  expect(productId).toBeTruthy();
  await productSelect.selectOption(productId ?? "");
  await page.locator('input[name^="order-item-quantity-"]').first().fill("2");

  await page.getByLabel("Recipient name").fill("E2E Customer");
  await page.getByLabel("Recipient phone").fill("+977-9812345678");
  await page.getByLabel("Delivery address").fill("E2E Street 1, Kathmandu");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page).not.toHaveURL(/\/new$/);
  await expect(page).toHaveURL(new RegExp(`/dashboard/${businessId}/orders/[^/]+$`));
  await expect(page.getByRole("heading", { name: /Order ORD-/ })).toBeVisible();
  const orderId = new URL(page.url()).pathname.split("/").at(-1);
  expect(orderId).toBeTruthy();
  expect(orderId).not.toBe("new");

  // Copy tracking URL: the token is rendered as the path inside a <code>.
  const trackingPath = (
    await page.locator("code", { hasText: "/track/" }).first().textContent()
  )?.trim();
  expect(trackingPath).toMatch(/^\/track\/.+$/);

  // Open the tracking URL and verify the public customer view.
  await page.goto(trackingPath ?? "");
  await expect(page.getByRole("heading", { name: businessName })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Order #/ })).toBeVisible();
  await expect(page.getByText("E2E Latte")).toBeVisible();
  await expect(page.getByText("Order received").first()).toBeVisible();

  // Update the order status (PENDING → CONFIRMED).
  await page.goto(`/dashboard/${businessId}/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: /Order ORD-/ })).toBeVisible();
  await page.locator('input[name="status"][value="CONFIRMED"]').check();
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("Status updated to Confirmed.")).toBeVisible();

  // Verify the customer sees the new status on the public page.
  await page.goto(trackingPath ?? "");
  await expect(page.getByText("Order confirmed").first()).toBeVisible();

  // The orders list footer must use the singular count for a single order.
  await page.goto(`/dashboard/${businessId}/orders`);
  await expect(page.getByText(/Page 1 of 1 · 1 order\b/)).toBeVisible();
});
