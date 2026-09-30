import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindSettingsPageEvents,
  openSettingsPage,
  renderSettingsPage,
  type SettingsPageState,
} from '../src/components/settingspage';
import type { SettingsInfo } from '../src/app.types';

const settingsInfo: SettingsInfo = {
  kubeconfigSearchPath: '/tmp/kubeconfigs',
  savedKubeconfigs: [{ id: 'saved-1', label: 'dev', kubeconfig: 'apiVersion: v1' }],
  cliToolsAvailability: {
    docker: { available: true, message: '', path: '/usr/bin/docker' },
    kind: { available: false, message: 'Not found' },
    kubectl: { available: true, message: '', path: '/usr/bin/kubectl' },
  },
};

function createState(): SettingsPageState {
  return {
    view: 'settings',
    kubeconfigSearchPath: settingsInfo.kubeconfigSearchPath,
    settingsLoading: false,
    settingsSaving: false,
    settingsSaved: false,
    settingsError: '',
    savedKubeconfigs: settingsInfo.savedKubeconfigs,
    kubeconfigDrafts: {},
    cliToolsAvailability: settingsInfo.cliToolsAvailability,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Settings page', () => {
  it('renders saved kubeconfigs and detected executable paths', () => {
    const html = renderSettingsPage(createState());

    expect(html).toContain('value="/tmp/kubeconfigs"');
    expect(html).toContain('saved-kubeconfig-saved-1');
    expect(html).toContain('/usr/bin/kubectl');
  });

  it('renders saved edits and status feedback', () => {
    const state = createState();
    state.kubeconfigDrafts['saved-1'] = 'updated config';
    state.settingsSaved = true;

    const html = renderSettingsPage(state);

    expect(html).toContain('>updated config</textarea>');
    expect(html).toContain('Settings saved.');
  });

  it('loads saved settings and rerenders when complete', async () => {
    const state = createState();
    state.kubeconfigSearchPath = '';
    const render = vi.fn();

    await openSettingsPage(state, {
      api: { getSettings: async () => settingsInfo },
      render,
      loadContexts: vi.fn(),
      loadSnapshot: vi.fn(),
    });

    expect(state.kubeconfigSearchPath).toBe('/tmp/kubeconfigs');
    expect(state.savedKubeconfigs).toEqual(settingsInfo.savedKubeconfigs);
    expect(state.settingsLoading).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable settings when no API is provided', async () => {
    const state = createState();

    await openSettingsPage(state, {
      render: vi.fn(),
      loadContexts: vi.fn(),
      loadSnapshot: vi.fn(),
    });

    expect(state.settingsError).toBe('Settings are unavailable.');
    expect(state.settingsLoading).toBe(false);
  });

  it('shows validation feedback for an empty search path', () => {
    const state = createState();
    document.body.innerHTML = renderSettingsPage(state);
    const render = vi.fn();

    bindSettingsPageEvents(document, state, {
      render,
      loadContexts: vi.fn(),
      loadSnapshot: vi.fn(),
    });
    const input = document.querySelector<HTMLInputElement>('#kubeconfig-search-path');
    const form = document.querySelector<HTMLFormElement>('#settings-form');
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();
    if (!input || !form) {
      throw new Error('Settings form controls did not render.');
    }
    input.value = ' ';
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(state.settingsError).toBe('Enter a kubeconfig search path.');
    expect(render).toHaveBeenCalledOnce();
  });
});