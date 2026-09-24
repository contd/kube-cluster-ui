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

const expectedColumns: Record<string, string[]> = {
  nodes: ['Name', 'Status', 'Roles', 'Version', 'CPU', 'Memory', 'Age'],
  pods: ['Name', 'Namespace', 'Age', 'Ready', 'Status', 'Restarts', 'Node'],
  deployments: ['Name', 'Namespace', 'Age', 'Ready', 'Up To Date', 'Available'],
  daemonsets: ['Name', 'Namespace', 'Age', 'Ready', 'Up To Date', 'Available'],
  statefulsets: ['Name', 'Namespace', 'Age', 'Ready', 'Up To Date', 'Available'],
  services: ['Name', 'Namespace', 'Age', 'Type', 'Cluster IP', 'Ports'],
  ingresses: ['Name', 'Namespace', 'Age', 'Class', 'Hosts'],
  configmaps: ['Name', 'Namespace', 'Age', 'Keys'],
  secrets: ['Name', 'Namespace', 'Age', 'Type', 'Keys'],
  pvcs: ['Name', 'Namespace', 'Age', 'Status', 'Capacity', 'StorageClass'],
  events: ['Name', 'Namespace', 'Type', 'Reason', 'Object', 'Count', 'Last Seen'],
};

// These end-to-end tests exercise the renderer through a real browser page.
// They intentionally use the application's demo fallback so the suite remains
// repeatable and does not require kubectl, a kubeconfig, or a live cluster.
test.describe('Kube Cluster UI demo data', () => {
  // Every test starts from a freshly loaded dashboard and verifies that the
  // preload/data-loading path has settled on the deterministic demo dataset.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.connection')).toHaveText('Demo data');
  });

  // The navigation should expose every supported Kubernetes resource category.
  // Clicking each item must update the heading and render at least one row,
  // proving that the view-specific table configuration and demo data agree.
  for (const [label, kind] of views) {
    test(`${label} view renders demo resources`, async ({ page }) => {
      await page.locator(`.nav-item[data-kind="${kind}"]`).click();

      await expect(page.locator('h1')).toHaveText(label);
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('tbody tr')).not.toHaveCount(0);
    });
  }

  // Dashboard is the Cluster landing section rather than a resource table.
  // It should show the summary cards and keep data-view controls out of the
  // summary-only surface.
  test('Dashboard view renders the summary grid', async ({ page }) => {
    await page.locator('.nav-item[data-kind="dashboard"]').click();

    await expect(page.locator('.nav-item[data-kind="dashboard"]')).toHaveClass(/active/);
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.locator('.summary-grid')).toBeVisible();
    await expect(page.locator('.summary-card')).toHaveCount(4);
    await expect(page.locator('table')).toHaveCount(0);
  });

  // Walks through the entire sidebar in its user-facing order, starting at
  // Nodes and ending at Events. Each iteration checks both navigation state and
  // rendered content: the clicked item becomes active, the page heading matches
  // the selected resource kind, rows are available, and the table exposes the
  // complete set of columns expected for that resource category.
  test('navigates through every left navigation section with complete views', async ({ page }) => {
    for (const [label, kind] of views) {
      const navigationItem = page.locator(`.nav-item[data-kind="${kind}"]`);
      await navigationItem.click();

      await expect(navigationItem).toHaveClass(/active/);
      await expect(page.locator('h1')).toHaveText(label);
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('tbody tr')).not.toHaveCount(0);

      const headers = page.locator('thead th');
      const columns = expectedColumns[kind];
      await expect(headers).toHaveCount(columns.length);
      await expect(headers.nth(0)).toContainText('Name');
      for (const [index, column] of columns.slice(1).entries()) {
        await expect(headers.nth(index + 1)).toHaveText(column);
      }
    }
  });

  // Captures the default light dashboard as a visual artifact. The workspace
  // assertion ensures the screenshot is taken after the primary layout exists,
  // while the heading assertion guards against capturing a loading/about view.
  test('captures the default interface screenshot', async ({ page }) => {
    await expect(page.locator('.workspace')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.locator('.summary-grid')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await page.screenshot({
      path: 'docs/main-interface.png',
      fullPage: true,
    });
  });

  // Verifies that the theme control updates the document-level theme state and
  // records a dark-mode visual artifact for regression comparison.
  test('captures the dark mode interface screenshot', async ({ page }) => {
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      path: 'docs/main-interface-dark.png',
      fullPage: true,
    });
  });

  // Confirms that selecting a resource opens the inspector and produces a
  // sanitized manifest, then verifies the close control removes the panel.
  test('opens and closes the resource inspector', async ({ page }) => {
    await page.locator('.nav-item[data-kind="pods"]').click();
    await page.locator('tbody tr').first().click();

    await expect(page.locator('.inspector')).toHaveClass(/open/);
    await expect(page.locator('#manifest')).toContainText('metadata:');
    await expect(page.locator('#manifest')).not.toContainText('managedFields:');

    await page.locator('#close-inspector').click();
    await expect(page.locator('.inspector')).not.toHaveClass(/open/);
  });

  // Confirms that clicking the Name column toggles between descending and
  // ascending order, including the visual direction indicator and row order.
  test('sorts a view by clicking a column heading', async ({ page }) => {
    await page.locator('.nav-item[data-kind="pods"]').click();
    const firstName = page.locator('tbody tr').first().locator('td').first();
    await page.locator('.sort-button[data-sort-column="Name"]').click();
    const descendingName = await firstName.innerText();
    await expect(page.locator('.sort-button[data-sort-column="Name"]')).toContainText('↓');

    await page.locator('.sort-button[data-sort-column="Name"]').click();
    const ascendingName = await firstName.innerText();

    expect(descendingName).not.toBe(ascendingName);
    await expect(page.locator('.sort-button[data-sort-column="Name"]')).toContainText('↑');
  });

  // Verifies both appearance controls: the theme toggle changes the HTML theme
  // attribute and the density selector applies the selected compact layout.
  test('switches theme and compact density modes', async ({ page }) => {
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('#density-select').selectOption('compact');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  });
});
