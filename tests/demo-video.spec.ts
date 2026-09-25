import { test, expect } from '@playwright/test';

// Record the complete browser interaction so the resulting artifact can be
// reviewed as a demonstration of the main dashboard workflow.
test.use({ video: 'on' });

// This suite uses a deterministic mocked cluster. That keeps the recorded flow
// independent of kubectl, a kubeconfig, or a live Kubernetes cluster.
test.describe('demo video flow', () => {
  // Start from the dashboard and wait for the data source indicator before any
  // navigation. This prevents the recording from capturing an intermediate
  // loading state as if it were part of the intended workflow.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: 'tests/kube-api-mock.js' });
    await page.goto('/');
    await expect(page.locator('.cluster-status')).toHaveText('Connected to test-cluster');
    await expect(page.locator('.banner')).toHaveCount(0);
  });

  // Demonstrates the primary browsing path: verify the default Pods view,
  // switch to Nodes, return to Pods, and open the first pod's inspector. The
  // manifest assertions confirm that the detail panel is populated and that
  // server-managed metadata is removed from the user-facing YAML.
  test('switches between Pods and Nodes and opens a Pod detail panel', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.locator('.summary-grid')).toBeVisible();
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

    const video = page.video();
    if (!video) {
      throw new Error('Playwright video recording is unavailable.');
    }
    await page.context().close();
    await video.saveAs('docs/snapshots/video.webm');
  });
});
