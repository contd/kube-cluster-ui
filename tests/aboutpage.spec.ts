import { expect, test } from '@playwright/test';

test.describe('About page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: 'tests/kube-api-mock.js' });
    await page.goto('/');
    await expect(page.locator('.cluster-status')).toHaveText('Connected to test-cluster');
  });

  test('renders application information from the About menu', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new Event('app:show-about')));

    await expect(page.locator('h1')).toHaveText('Orbita');
    await expect(page.locator('.about-version')).toHaveText('Version 2.5.0');
    await expect(page.locator('.about-description')).toContainText('Kubernetes cluster browser');
    await expect(page.locator('.about-details a')).toHaveAttribute(
      'href',
      'https://github.com/contd/orbita.git',
    );
    await page.screenshot({ path: 'assets/snapshots/27-about.png', fullPage: true });
  });

  test('returns to the dashboard from About', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new Event('app:show-about')));
    await expect(page.locator('h1')).toHaveText('Orbita');

    await page.locator('#about-back').click();

    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.locator('.summary-grid')).toBeVisible();
  });
});