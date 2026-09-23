import { test, expect } from '@playwright/test';

const views = [
  ['Nodes', 'nodes'],
  ['Pods', 'pods'],
  ['Deployments', 'deployments'],
  ['DaemonSets', 'daemonsets'],
  ['StatefulSets', 'statefulsets'],
  ['Services', 'services'],
  ['Ingresses', 'ingresses'],
  ['ConfigMaps', 'configmaps'],
  ['Secrets', 'secrets'],
  ['PVCs', 'pvcs'],
  ['Events', 'events'],
] as const;

test.describe('Kube Cluster UI demo data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.connection')).toHaveText('Demo data');
  });

  for (const [label, kind] of views) {
    test(`${label} view renders demo resources`, async ({ page }) => {
      await page.locator(`.nav-item[data-kind="${kind}"]`).click();

      await expect(page.locator('h1')).toHaveText(label);
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('tbody tr')).not.toHaveCount(0);
    });
  }

  test('captures the default interface screenshot', async ({ page }) => {
    await expect(page.locator('.workspace')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Pods');
    await page.screenshot({
      path: 'docs/main-interface.png',
      fullPage: true,
    });
  });

  test('captures the dark mode interface screenshot', async ({ page }) => {
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      path: 'docs/main-interface-dark.png',
      fullPage: true,
    });
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

  test('opens and closes the resource inspector', async ({ page }) => {
    await page.locator('tbody tr').first().click();

    await expect(page.locator('.inspector')).toHaveClass(/open/);
    await expect(page.locator('#manifest')).toContainText('metadata:');
    await expect(page.locator('#manifest')).not.toContainText('managedFields:');

    await page.locator('#close-inspector').click();
    await expect(page.locator('.inspector')).not.toHaveClass(/open/);
  });

  test('sorts a view by clicking a column heading', async ({ page }) => {
    const firstName = page.locator('tbody tr').first().locator('td').first();
    await page.locator('.sort-button[data-sort-column="Name"]').click();
    const descendingName = await firstName.innerText();
    await expect(page.locator('.sort-button[data-sort-column="Name"]')).toContainText('↓');

    await page.locator('.sort-button[data-sort-column="Name"]').click();
    const ascendingName = await firstName.innerText();

    expect(descendingName).not.toBe(ascendingName);
    await expect(page.locator('.sort-button[data-sort-column="Name"]')).toContainText('↑');
  });

  test('switches theme and compact density modes', async ({ page }) => {
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('#density-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  });
});
