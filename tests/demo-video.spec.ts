import { test, expect } from '@playwright/test';

test.use({ video: 'on' });

test.describe('demo video flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.connection')).toHaveText('Demo data');
  });

  test('switches between Pods and Nodes and opens a Pod detail panel', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Pods');
    await page.waitForTimeout(1500);

    await page.locator('.nav-item[data-kind="nodes"]').click();
    await expect(page.locator('h1')).toHaveText('Nodes');
    await page.waitForTimeout(1800);

    await page.locator('.nav-item[data-kind="pods"]').click();
    await expect(page.locator('h1')).toHaveText('Pods');
    await page.waitForTimeout(1600);

    await page.locator('tbody tr').first().click();
    await expect(page.locator('.inspector')).toHaveClass(/open/);
    await page.waitForTimeout(1600);
    await expect(page.locator('#manifest')).toContainText('metadata:');
    await expect(page.locator('#manifest')).not.toContainText('managedFields:');
    await page.waitForTimeout(1800);
  });
});
