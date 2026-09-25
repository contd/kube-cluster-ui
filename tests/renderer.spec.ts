import { test, expect, type Page } from '@playwright/test';

const views = [
  ['Nodes', 'nodes', '02-nodes'],
  ['Namespaces', 'namespaces', '03-namespaces'],
  ['Pods', 'pods', '04-pods'],
  ['Deployments', 'deployments', '05-deployments'],
  ['DaemonSets', 'daemonsets', '06-daemonsets'],
  ['StatefulSets', 'statefulsets', '07-statefulsets'],
  ['ReplicaSets', 'replicasets', '08-replicasets'],
  ['Jobs', 'jobs', '09-jobs'],
  ['CronJobs', 'cronjobs', '10-cronjobs'],
  ['PV', 'pvs', '11-pvs'],
  ['Storage Class', 'storageclasses', '12-storageclasses'],
  ['Services', 'services', '13-services'],
  ['Ingresses', 'ingresses', '14-ingresses'],
  ['Service Accounts', 'serviceaccounts', '20-serviceaccounts'],
  ['Cluster Roles', 'clusterroles', '21-clusterroles'],
  ['Roles', 'roles', '22-roles'],
  ['Cluster Role Bindings', 'clusterrolebindings', '23-clusterrolebindings'],
  ['Role Bindings', 'rolebindings', '24-rolebindings'],
  ['ConfigMaps', 'configmaps', '15-configmaps'],
  ['Secrets', 'secrets', '16-secrets'],
  ['PVCs', 'pvcs', '17-pvcs'],
  ['Events', 'events', '18-events'],
] as const;

const expectedColumns: Record<string, string[]> = {
  nodes: ['Name', 'Status', 'Roles', 'Taints', 'Version', 'CPU', 'Memory', 'Age'],
  pods: ['Name', 'Namespace', 'Age', 'Containers', 'Status', 'Restarts', 'Node', 'Controlled By'],
  deployments: ['Name', 'Namespace', 'Pods', 'Replicas', 'Age'],
  daemonsets: ['Name', 'Namespace', 'Desired', 'Current', 'Ready', 'Up-to-Date', 'Available', 'Age'],
  statefulsets: ['Name', 'Namespace', 'Pods', 'Replicas', 'Age'],
  replicasets: ['Name', 'Namespace', 'Desired', 'Current', 'Ready', 'Age'],
  jobs: ['Name', 'Namespace', 'Start Time', 'End Time', 'Ready', 'Succeded', 'Terminating', 'Age'],
  cronjobs: ['Name', 'Namespace', 'Schedule', 'Suspend', 'Active', 'Last Schedule', 'Age'],
  pvs: ['Name', 'Storage Class', 'Capacity', 'Claim', 'Age', 'Status'],
  storageclasses: ['Name', 'Provisioner', 'Reclaim Policy', 'Volume Binding Mode', 'Allow Volume Expansion', 'Age'],
  services: ['Name', 'Namespace', 'Age', 'Type', 'Cluster IP', 'Ports'],
  ingresses: ['Name', 'Namespace', 'Age', 'Class', 'Hosts'],
  serviceaccounts: ['Name', 'Namespace', 'Secrets', 'Age'],
  clusterroles: ['Name', 'Rules', 'Age'],
  roles: ['Name', 'Namespace', 'Rules', 'Age'],
  clusterrolebindings: ['Name', 'Subjects', 'Role', 'Age'],
  rolebindings: ['Name', 'Namespace', 'Subjects', 'Role', 'Age'],
  configmaps: ['Name', 'Namespace', 'Age', 'Keys'],
  secrets: ['Name', 'Namespace', 'Age', 'Type', 'Keys'],
  pvcs: ['Name', 'Namespace', 'Age', 'Status', 'Capacity', 'StorageClass'],
  events: ['Name', 'Namespace', 'Type', 'Reason', 'Object', 'Count', 'Last Seen'],
  namespaces: ['Name', 'Status', 'Age', 'Labels'],
};

async function openNavigationItem(page: Page, kind: string): Promise<void> {
  const item = page.locator(`.nav-item[data-kind="${kind}"]`);
  if (!(await item.isVisible())) {
    await page.locator('.nav-group').filter({ has: item }).locator('.nav-group-toggle').click();
  }
  await item.click();
}

async function expectCliTooltip(page: Page, selector: string, text: string): Promise<void> {
  const tool = page.locator(selector);
  await tool.hover();
  await expect.poll(() => tool.evaluate((element) => {
    return getComputedStyle(element, '::after').content;
  })).toBe(`"${text}"`);
  await expect.poll(() => tool.evaluate((element) => {
    return getComputedStyle(element, '::after').visibility;
  })).toBe('visible');
}

// These end-to-end tests use a deterministic live-cluster preload mock so they
// do not require kubectl, a kubeconfig, or a real cluster.
test.describe('Kube Cluster UI views', () => {
  // Start with a connected test cluster and ensure no fallback banner leaks
  // into screenshots or view assertions.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: 'tests/kube-api-mock.js' });
    await page.goto('/');
    await expect(page.locator('.cluster-status')).toHaveText('Connected to test-cluster');
    await expect(page.locator('.kubectl-detection')).toHaveText('kubectl');
    await expect(page.locator('.docker-detection')).toHaveText('docker');
    await expect(page.locator('.kind-detection')).toHaveText('kind');
    await expect(page.locator('.kubectl-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(79, 192, 141)');
    await expect(page.locator('.docker-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(79, 192, 141)');
    await expect(page.locator('.kind-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(79, 192, 141)');
    await expect(page.locator('.banner')).toHaveCount(0);
  });

  // The navigation should expose every supported Kubernetes resource category.
  // Clicking each item must update the heading and render at least one row,
  // proving that the view-specific table configuration matches its fixture.
  for (const [label, kind, snapshotName] of views) {
    test(`${label} view renders test resources`, async ({ page }) => {
      await openNavigationItem(page, kind);

      await expect(page.locator('h1')).toHaveText(label);
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('tbody tr')).not.toHaveCount(0);
      await page.screenshot({
        path: `docs/snapshots/${snapshotName}.png`,
        fullPage: true,
      });
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
    await page.screenshot({ path: 'docs/snapshots/01-dashboard.png', fullPage: true });
  });

  test('hides zero nav counts until a resource collection loads', async ({ page }) => {
    const clusterRoles = page.locator('.nav-item[data-kind="clusterroles"]');
    await expect(clusterRoles.locator('.nav-count')).toHaveCount(0);

    await openNavigationItem(page, 'clusterroles');
    await expect(page.locator('tbody tr')).not.toHaveCount(0);
    await expect(clusterRoles.locator('.nav-count')).toHaveText('1');
  });

  test('shows CLI availability in hover tooltips', async ({ page }) => {
    await expectCliTooltip(page, '.kubectl-detection', 'Detected');
    await expectCliTooltip(page, '.docker-detection', 'Detected');
    await expectCliTooltip(page, '.kind-detection', 'Detected');
  });

  test('disables and dims the terminal when kubectl is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      if (window.kubeApi) {
        window.kubeApi.checkCliTools = async () => ({
          kubectl: {
            available: false,
            message: 'kubectl is not available on PATH. Install kubectl and restart the app.',
          },
          docker: { available: true, message: '' },
          kind: { available: false, message: 'kind is not available on PATH.' },
        });
      }
    });
    await page.reload();

    await expect(page.locator('.dashboard-terminal-grid')).toHaveClass(/kubectl-disabled/);
    await expect(page.locator('.kubectl-disabled-overlay')).toBeVisible();
    await expect(page.locator('.kubectl-disabled-message')).toContainText(
      'kubectl is not available on PATH. Install kubectl and restart the app.',
    );
    await expect(page.locator('.kubectl-detection')).toHaveText('kubectl');
    await expect(page.locator('.docker-detection')).toHaveText('docker');
    await expect(page.locator('.kind-detection')).toHaveText('kind');
    await expectCliTooltip(page, '.kubectl-detection', 'Not detected');
    await expectCliTooltip(page, '.docker-detection', 'Detected');
    await expectCliTooltip(page, '.kind-detection', 'Not detected');
    await expect(page.locator('.kubectl-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(223, 109, 97)');
    await expect(page.locator('.docker-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(79, 192, 141)');
    await expect(page.locator('.kind-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(223, 109, 97)');
    await expect(page.locator('#kubectl-command')).toBeDisabled();
    await expect(page.locator('#kubectl-run')).toBeDisabled();
    await expect(page.locator('#kubectl-output-toggle')).toBeDisabled();
    await expect(page.locator('#kubectl-clear-history')).toBeDisabled();
    await page.screenshot({ path: 'docs/snapshots/19-kubectl-unavailable.png', fullPage: true });
  });

  test('marks Docker and kind unavailable without disabling the terminal', async ({ page }) => {
    await page.addInitScript(() => {
      if (window.kubeApi) {
        window.kubeApi.checkCliTools = async () => ({
          kubectl: { available: true, message: '' },
          docker: { available: false, message: 'Docker is not available on PATH.' },
          kind: { available: false, message: 'kind is not available on PATH.' },
        });
      }
    });
    await page.reload();

    await expect(page.locator('.kubectl-detection')).toHaveText('kubectl');
    await expect(page.locator('.docker-detection')).toHaveText('docker');
    await expect(page.locator('.kind-detection')).toHaveText('kind');
    await expectCliTooltip(page, '.kubectl-detection', 'Detected');
    await expectCliTooltip(page, '.docker-detection', 'Not detected');
    await expectCliTooltip(page, '.kind-detection', 'Not detected');
    await expect(page.locator('.docker-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(223, 109, 97)');
    await expect(page.locator('.kind-detection .cli-detection-indicator')).toHaveCSS('background-color', 'rgb(223, 109, 97)');
    await expect(page.locator('.dashboard-terminal-grid')).not.toHaveClass(/kubectl-disabled/);
    await expect(page.locator('#kubectl-command')).toBeEnabled();
  });

  test('runs kubectl with the selected context and highlights its output', async ({ page }) => {
    await page.addInitScript(() => {
      const mockKubeApi: Partial<NonNullable<Window['kubeApi']>> = {
        setContext: async (contextId) => ({
          defaultPath: '/tmp/kubeconfig',
          contexts: [
            {
              id: 'test-config::dev',
              name: 'dev',
              cluster: 'demo-cluster',
              user: 'demo-user',
              namespace: 'default',
              filePath: '/tmp/kubeconfig',
              fileName: 'kubeconfig',
              isCurrent: contextId === 'test-config::dev',
            },
            {
              id: 'test-config::prod',
              name: 'prod',
              cluster: 'production-cluster',
              user: 'prod-user',
              namespace: 'default',
              filePath: '/tmp/kubeconfig',
              fileName: 'kubeconfig',
              isCurrent: contextId === 'test-config::prod',
            },
          ],
          selectedContextId: contextId,
        }),
        getContexts: async () => ({
          defaultPath: '/tmp/kubeconfig',
          contexts: [
            {
              id: 'test-config::dev',
              name: 'dev',
              cluster: 'demo-cluster',
              user: 'demo-user',
              namespace: 'default',
              filePath: '/tmp/kubeconfig',
              fileName: 'kubeconfig',
              isCurrent: true,
            },
            {
              id: 'test-config::prod',
              name: 'prod',
              cluster: 'production-cluster',
              user: 'prod-user',
              namespace: 'default',
              filePath: '/tmp/kubeconfig',
              fileName: 'kubeconfig',
              isCurrent: false,
            },
          ],
          selectedContextId: 'test-config::dev',
        }),
        checkCliTools: async () => ({
          kubectl: { available: true, message: '' },
          docker: { available: true, message: '' },
          kind: { available: true, message: '' },
        }),
        getSnapshot: async (_namespace, contextId) => ({
          context: contextId === 'test-config::prod' ? 'prod' : 'dev',
          mode: 'live' as const,
          namespaces: [],
          resources: {},
        }),
        runKubectl: async (command, contextId) => {
          document.documentElement.dataset.lastKubectlCommand = command;
          document.documentElement.dataset.lastKubectlContext = contextId || '';
          return {
            stdout: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo\nstatus:\n  phase: Running\n',
            stderr: '',
            exitCode: 0,
          };
        },
      };
      window.kubeApi = mockKubeApi as NonNullable<Window['kubeApi']>;
    });
    await page.reload();
    await expect(page.locator('.cluster-status')).toHaveText('Connected to dev');
    await expect(page.locator('.kubectl-detection')).toHaveText('kubectl');
    await expect(page.locator('.docker-detection')).toHaveText('docker');
    await expect(page.locator('.kind-detection')).toHaveText('kind');
    await expect(page.locator('.dashboard-terminal-grid')).toBeVisible();
    await expect(page.locator('.dashboard-terminal-grid')).toHaveCSS(
      'grid-template-columns',
      /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/,
    );

    await page.locator('#kubectl-command').fill('kubectl get pod demo -o yaml');
    await page.locator('#kubectl-run').click();

    await expect(page.locator('#kubectl-output .yaml-key').first()).toContainText('apiVersion');
    await expect(page.locator('.kubectl-exit-status')).toHaveText('Exit 0');
    await expect(page.locator('html')).toHaveAttribute('data-last-kubectl-command', 'kubectl get pod demo -o yaml');
    await expect(page.locator('html')).toHaveAttribute('data-last-kubectl-context', 'test-config::dev');

    const outputToggle = page.locator('#kubectl-output-toggle');
    const columnRatio = async () => page.locator('.dashboard-terminal-grid').evaluate((grid) => {
      const [commandColumn, outputColumn] = getComputedStyle(grid)
        .gridTemplateColumns.split(' ')
        .map(Number.parseFloat);
      return outputColumn / commandColumn;
    });

    await expect(outputToggle).toHaveAttribute('aria-expanded', 'false');
    await outputToggle.click();
    await expect(outputToggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(columnRatio).toBeGreaterThan(3.9);
    await outputToggle.click();
    await expect(outputToggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(columnRatio).toBeLessThan(1.1);

    await page.locator('#kubectl-clear-output').click();
    await expect(page.locator('#kubectl-output')).toContainText('Awaiting output');
    await expect(page.locator('.kubectl-exit-status')).toHaveCount(0);
    await expect(page.locator('.kubectl-history-entry')).toHaveCount(1);

    await page.locator('#kubectl-command').fill('kubectl get pods');
    await page.locator('#kubectl-run').click();
    await expect(page.locator('.kubectl-exit-status')).toHaveText('Exit 0');
    await expect(page.locator('.kubectl-history-entry')).toHaveCount(2);

    await page.locator('#kubectl-clear-history').click();
    await expect(page.locator('.kubectl-history-entry')).toHaveCount(0);
    await expect(page.locator('#kubectl-output .yaml-key').first()).toContainText('apiVersion');
    await expect(page.locator('.kubectl-exit-status')).toHaveText('Exit 0');

    await page.locator('#kubectl-command').fill('kubectl get namespaces');
    await page.locator('#kubectl-run').click();
    await expect(page.locator('.kubectl-history-entry')).toHaveCount(1);
    await page.locator('#context-select').selectOption('test-config::prod');
    await expect(page.locator('.cluster-status')).toHaveText('Connected to prod');
    await expect(page.locator('.kubectl-output-muted')).toHaveText('Awaiting output');
    await expect(page.locator('.kubectl-exit-status')).toHaveCount(0);
    await expect(page.locator('.kubectl-history-entry')).toHaveCount(1);
    await expect(page.locator('.kubectl-context')).toContainText('prod');

    const commandInput = page.locator('#kubectl-command');
    await commandInput.fill('k');
    await commandInput.press('Tab');
    await expect(commandInput).toHaveValue('kubectl ');
    expect(await commandInput.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(8);

    await commandInput.fill('k get pods');
    await expect(commandInput).toHaveValue('kubectl get pods');
    expect(await commandInput.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(16);
    await page.locator('#kubectl-run').click();
    await expect(page.locator('.kubectl-exit-status')).toHaveText('Exit 0');
    await expect(page.locator('html')).toHaveAttribute('data-last-kubectl-command', 'kubectl get pods');

    await commandInput.fill('k');
    await page.locator('#kubectl-run').click();
    await expect(page.locator('.kubectl-exit-status')).toHaveText('Exit 0');
    await expect(page.locator('html')).toHaveAttribute('data-last-kubectl-command', 'k');
  });

  test('navigation groups can be collapsed and expanded', async ({ page }) => {
    const groups = page.locator('.nav-group');
    const firstToggle = page.locator('.nav-group-toggle').first();

    await page.locator('#density-select').selectOption('cozy');
    await expect(firstToggle).toHaveCSS('font-size', '22px');
    await page.locator('#density-select').selectOption('compact');
    const compactFontRatio = await firstToggle.evaluate((element) => {
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      const rootFontSize = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      return Number((fontSize / rootFontSize).toFixed(2));
    });
    expect(compactFontRatio).toBe(1.05);
    await page.locator('#density-select').selectOption('cozy');

    for (const group of await groups.all()) {
      const toggle = group.locator('.nav-group-toggle');
      const content = group.locator('.nav-group-content');
      const groupName = await toggle.locator('span').innerText();
      const startsExpanded = !['Configuration', 'Storage', 'Observability'].includes(groupName);

      await expect(toggle).toHaveAttribute('aria-expanded', String(startsExpanded));
      if (startsExpanded) {
        await expect(content).toBeVisible();
      } else {
        await expect(content).toBeHidden();
      }
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', String(!startsExpanded));
      if (startsExpanded) {
        await expect(content).toBeHidden();
      } else {
        await expect(content).toBeVisible();
      }
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', String(startsExpanded));
    }
  });

  // Pod rows should use the same semantic status dot as other resource views,
  // while the Containers column exposes one yellow square per container.
  test('shows container squares while retaining the standard Pod status dot', async ({ page }) => {
    await page.locator('.nav-item[data-kind="pods"]').click();

    const firstPod = page.locator('tbody tr').first();
    await expect(firstPod.locator('.status-dot')).toHaveCount(1);
    await expect(firstPod.locator('.pod-container-square')).toHaveCount(2);
    await expect(firstPod.locator('.pod-container-square').first()).toHaveCSS('background-color', 'rgb(231, 181, 47)');
  });

  // Walks through the entire sidebar in its user-facing order, starting at
  // Nodes and ending at Events. Each iteration checks both navigation state and
  // rendered content: the clicked item becomes active, the page heading matches
  // the selected resource kind, rows are available, and the table exposes the
  // complete set of columns expected for that resource category.
  test('navigates through every left navigation section with complete views', async ({ page }) => {
    for (const [label, kind] of views) {
      const navigationItem = page.locator(`.nav-item[data-kind="${kind}"]`);
      await openNavigationItem(page, kind);

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
    await expect(page.locator('.kubectl-disabled-overlay')).toHaveCount(0);
    await expect(page.locator('#kubectl-command')).toBeEnabled();
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
