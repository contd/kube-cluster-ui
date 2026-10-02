/** Settings page rendering, kubeconfig editing, and persistence event handling. */
import type {
  CliToolsAvailability,
  KubeApi,
  SavedKubeconfig,
} from '../app.types';
import { escapeHtml } from '../dataplane';

type PageView = 'dashboard' | 'about' | 'settings';

export type SettingsPageState = {
  view: PageView;
  kubeconfigSearchPath: string;
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsSaved: boolean;
  settingsError: string;
  savedKubeconfigs: SavedKubeconfig[];
  kubeconfigDrafts: Record<string, string>;
  cliToolsAvailability: CliToolsAvailability | null;
};

type SettingsApi = Partial<Pick<
  KubeApi,
  'getSettings' | 'setKubeconfigSearchPath' | 'updateSavedKubeconfig'
>>;

export type SettingsPageActions = {
  api?: SettingsApi;
  render: () => void;
  loadContexts: () => Promise<void>;
  loadSnapshot: () => Promise<void>;
};

/** Renders editable kubeconfig settings, saved documents, and detected CLI paths. */
export function renderSettingsPage(state: SettingsPageState): string {
  const cliPaths = state.cliToolsAvailability
    ? (['docker', 'kind', 'kubectl'] as const)
        .map((tool) => `${tool}: ${state.cliToolsAvailability?.[tool].path || 'Not found on PATH'}`)
        .join('\n')
    : 'Checking CLI locations...';

  return `
    <main class="about-page settings-page">
      <section class="about-card settings-card">
        <button class="tool-button about-back" id="settings-back">
          <i data-lucide="arrow-left"></i>
          Back to cluster
        </button>
        <div class="about-mark"><i data-lucide="settings-2"></i></div>
        <div class="eyebrow">Configuration</div>
        <h1>Settings</h1>
        <form class="settings-form" id="settings-form">
          <label class="settings-field" for="kubeconfig-search-path">
            <span>Kubeconfig search path</span>
            <input id="kubeconfig-search-path" type="text" value="${escapeHtml(state.kubeconfigSearchPath)}" placeholder="Path to a kubeconfig file or directory" ${state.settingsLoading || state.settingsSaving ? 'disabled' : ''} />
          </label>
          <section class="saved-kubeconfigs" aria-labelledby="saved-kubeconfigs-title">
            <div class="saved-kubeconfigs-heading">
              <h2 id="saved-kubeconfigs-title">Pasted kubeconfigs</h2>
              <span>${state.savedKubeconfigs.length}</span>
            </div>
            ${state.savedKubeconfigs.length
              ? state.savedKubeconfigs.map((saved) => `
                <article class="saved-kubeconfig-entry" data-saved-kubeconfig-id="${escapeHtml(saved.id)}">
                  <label class="settings-field" for="saved-kubeconfig-${escapeHtml(saved.id)}">
                    <span>${escapeHtml(saved.label)}</span>
                    <textarea id="saved-kubeconfig-${escapeHtml(saved.id)}" class="saved-kubeconfig-input" rows="8" spellcheck="false" ${state.settingsLoading || state.settingsSaving ? 'disabled' : ''}>${escapeHtml(state.kubeconfigDrafts[saved.id] ?? saved.kubeconfig)}</textarea>
                  </label>
                  <div class="saved-kubeconfig-actions">
                    <button class="primary-button saved-kubeconfig-save" type="button" ${state.settingsLoading || state.settingsSaving ? 'disabled' : ''}>Save kubeconfig</button>
                  </div>
                </article>
              `).join('')
              : '<p class="settings-empty">No pasted kubeconfigs saved.</p>'}
          </section>
          <label class="settings-field" for="cli-executable-paths">
            <span>Detected CLI executable paths</span>
            <textarea id="cli-executable-paths" rows="3" readonly>${escapeHtml(cliPaths)}</textarea>
          </label>
          ${state.settingsError ? `<p class="settings-feedback error" role="alert">${escapeHtml(state.settingsError)}</p>` : ''}
          ${state.settingsSaved ? '<p class="settings-feedback" role="status">Settings saved.</p>' : ''}
          <div class="settings-actions">
            <button class="tool-button" id="cancel-settings" type="button">Cancel</button>
            <button class="primary-button" id="save-settings" type="submit" ${state.settingsLoading || state.settingsSaving ? 'disabled' : ''}>
              ${state.settingsSaving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </form>
      </section>
    </main>
  `;
}

/** Loads persisted settings and refreshes the view when the request completes. */
export async function openSettingsPage(
  state: SettingsPageState,
  actions: SettingsPageActions,
): Promise<void> {
  state.view = 'settings';
  state.settingsLoading = true;
  state.settingsSaved = false;
  state.settingsError = '';
  actions.render();

  try {
    if (!actions.api?.getSettings) {
      throw new Error('Settings are unavailable.');
    }

    const settings = await actions.api.getSettings();
    state.kubeconfigSearchPath = settings.kubeconfigSearchPath;
    state.savedKubeconfigs = settings.savedKubeconfigs;
    state.kubeconfigDrafts = {};
    state.cliToolsAvailability = settings.cliToolsAvailability;
  } catch (error) {
    state.settingsError = error instanceof Error
      ? error.message
      : 'Unable to load settings.';
  } finally {
    state.settingsLoading = false;
    if (state.view === 'settings') {
      actions.render();
    }
  }
}

/** Wires Settings form controls to state, persistence APIs, and renderer refreshes. */
export function bindSettingsPageEvents(
  root: ParentNode,
  state: SettingsPageState,
  actions: SettingsPageActions,
): void {
  const closeSettings = () => {
    state.view = 'dashboard';
    actions.render();
  };

  root.querySelector<HTMLButtonElement>('#settings-back')?.addEventListener('click', closeSettings);
  root.querySelector<HTMLButtonElement>('#cancel-settings')?.addEventListener('click', closeSettings);
  root.querySelector<HTMLInputElement>('#kubeconfig-search-path')?.addEventListener('input', (event) => {
    state.kubeconfigSearchPath = (event.target as HTMLInputElement).value;
    state.settingsSaved = false;
  });
  root.querySelectorAll<HTMLTextAreaElement>('.saved-kubeconfig-input').forEach((input) => {
    input.addEventListener('input', () => {
      const entry = input.closest<HTMLElement>('.saved-kubeconfig-entry');
      const id = entry?.dataset.savedKubeconfigId;
      if (id) {
        state.kubeconfigDrafts[id] = input.value;
      }
    });
  });
  root.querySelectorAll<HTMLButtonElement>('.saved-kubeconfig-save').forEach((button) => {
    button.addEventListener('click', () => {
      const entry = button.closest<HTMLElement>('.saved-kubeconfig-entry');
      const id = entry?.dataset.savedKubeconfigId;
      const input = entry?.querySelector<HTMLTextAreaElement>('.saved-kubeconfig-input');
      if (!id || !input) {
        return;
      }

      const kubeconfig = input.value;
      state.kubeconfigDrafts[id] = kubeconfig;
      state.settingsSaving = true;
      state.settingsError = '';
      actions.render();

      void (async () => {
        try {
          if (!actions.api?.updateSavedKubeconfig) {
            throw new Error('Saved kubeconfigs cannot be updated.');
          }

          const settings = await actions.api.updateSavedKubeconfig(id, kubeconfig);
          state.kubeconfigSearchPath = settings.kubeconfigSearchPath;
          state.savedKubeconfigs = settings.savedKubeconfigs;
          const remainingDrafts = { ...state.kubeconfigDrafts };
          delete remainingDrafts[id];
          state.kubeconfigDrafts = remainingDrafts;
          state.cliToolsAvailability = settings.cliToolsAvailability;
          state.settingsSaved = true;
          await actions.loadContexts();
          await actions.loadSnapshot();
        } catch (error) {
          state.settingsError = error instanceof Error
            ? error.message
            : 'Unable to update the saved kubeconfig.';
        } finally {
          state.settingsSaving = false;
          if (state.view === 'settings') {
            actions.render();
          }
        }
      })();
    });
  });
  root.querySelector<HTMLFormElement>('#settings-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = root.querySelector<HTMLInputElement>('#kubeconfig-search-path');
    const searchPath = input?.value.trim() || '';
    if (!searchPath) {
      state.settingsError = 'Enter a kubeconfig search path.';
      actions.render();
      return;
    }

    state.kubeconfigSearchPath = searchPath;
    state.settingsSaving = true;
    state.settingsSaved = false;
    state.settingsError = '';
    actions.render();

    void (async () => {
      try {
        if (!actions.api?.setKubeconfigSearchPath) {
          throw new Error('Settings are unavailable.');
        }

        const settings = await actions.api.setKubeconfigSearchPath(searchPath);
        state.kubeconfigSearchPath = settings.kubeconfigSearchPath;
        state.cliToolsAvailability = settings.cliToolsAvailability;
        state.settingsSaved = true;
        await actions.loadContexts();
        await actions.loadSnapshot();
      } catch (error) {
        state.settingsError = error instanceof Error
          ? error.message
          : 'Unable to save settings.';
      } finally {
        state.settingsSaving = false;
        if (state.view === 'settings') {
          actions.render();
        }
      }
    })();
  });
}