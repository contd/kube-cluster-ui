/** End-to-end coverage for the settings page and persisted kubeconfig workflows. */
import { expect, test } from '@playwright/test';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: 'tests/kube-api-mock.js' });
    await page.goto('/');
    await expect(page.locator('.cluster-status')).toHaveText('Connected to test-cluster');
  });

  test('renders configuration and CLI paths', async ({ page }) => {
    await page.locator('#open-settings').click();

    await expect(page.locator('h1')).toHaveText('Settings');
    await expect(page.locator('#kubeconfig-search-path')).toHaveValue('/tmp/playwright-kubeconfig');
    await expect(page.locator('#cli-executable-paths')).toHaveJSProperty('readOnly', true);
    await expect(page.locator('#cli-executable-paths')).toContainText('/usr/local/bin/kubectl');
    await page.screenshot({ path: 'assets/snapshots/25-settings.png', fullPage: true });
  });

  test('renders editable saved kubeconfigs', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new Event('app:show-settings')));

    await expect(page.locator('h1')).toHaveText('Settings');
    await expect(page.locator('.saved-kubeconfig-input')).toHaveCount(1);
    await expect(page.locator('.saved-kubeconfig-input')).toBeEditable();
    await page.screenshot({
      path: 'assets/snapshots/26-settings-saved-kubeconfigs.png',
      fullPage: true,
    });
  });

  test('opens from Help and toolbar and persists kubeconfig changes', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new Event('app:show-settings')));
    await expect(page.locator('h1')).toHaveText('Settings');
    await expect(page.locator('#kubeconfig-search-path')).toHaveValue('/tmp/playwright-kubeconfig');
    await expect(page.locator('#cli-executable-paths')).toHaveJSProperty('readOnly', true);
    await expect(page.locator('#cli-executable-paths')).toHaveValue(
      'docker: /usr/local/bin/docker\nkind: /usr/local/bin/kind\nkubectl: /usr/local/bin/kubectl',
    );
    const savedKubeconfig = page.locator('.saved-kubeconfig-input');
    await expect(savedKubeconfig).toHaveCount(1);
    await expect(savedKubeconfig).toBeEditable();
    const editedKubeconfig = 'apiVersion: v1\nkind: Config\ncontexts:\n- name: updated-context\n';
    await savedKubeconfig.fill(editedKubeconfig);
    await page.locator('.saved-kubeconfig-save').click();
    await expect(savedKubeconfig).toHaveValue(editedKubeconfig);

    await page.locator('#kubeconfig-search-path').fill('/tmp/custom-kubeconfigs');
    await page.locator('#save-settings').click();
    await expect(page.locator('.settings-feedback')).toHaveText('Settings saved.');
    await page.locator('#settings-back').click();
    await page.locator('#open-settings').click();
    await expect(page.locator('#kubeconfig-search-path')).toHaveValue('/tmp/custom-kubeconfigs');
    await expect(page.locator('.saved-kubeconfig-input')).toHaveValue(editedKubeconfig);

    const pastedKubeconfig = 'apiVersion: v1\nkind: Config\ncontexts:\n- name: pasted-context\n';
    await page.locator('#settings-back').click();
    await page.locator('#add-context').click();
    await page.locator('#kubeconfig-input').fill(pastedKubeconfig);
    await page.locator('#save-kubeconfig').click();
    await expect(page.locator('#kubeconfig-dialog-backdrop')).toHaveCount(0);
    await page.locator('#open-settings').click();
    await expect(page.locator('.saved-kubeconfig-input')).toHaveCount(2);
    await expect(page.locator('.saved-kubeconfig-input').last()).toHaveValue(pastedKubeconfig.trim());
  });
});