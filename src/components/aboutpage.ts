/** About page rendering, metadata loading, and back-navigation event handling. */
import type { AboutInfo } from '../app.types';
import { escapeHtml } from '../dataplane';

type PageView = 'dashboard' | 'about' | 'settings';

export type AboutPageState = {
  view: PageView;
  about: AboutInfo | null;
};

export type AboutPageActions = {
  getAbout: () => Promise<AboutInfo>;
  render: () => void;
};

/** Produces the About page or its metadata loading placeholder. */
export function renderAboutPage(about: AboutInfo | null): string {
  if (!about) {
    return '<main class="about-page"><div class="about-card">Loading application information...</div></main>';
  }

  return `
    <main class="about-page">
      <section class="about-card">
        <button class="tool-button about-back" id="about-back">
          <i data-lucide="arrow-left"></i>
          Back to cluster
        </button>
        <div class="about-mark"><brand-mark></brand-mark></div>
        <div class="eyebrow">About</div>
        <h1>${escapeHtml(about.productName)}</h1>
        <p class="about-version">Version ${escapeHtml(about.version)}</p>
        <p class="about-description">${escapeHtml(about.description)}</p>
        <dl class="about-details">
          <div><dt>Author</dt><dd>${escapeHtml(about.author.name)}${about.author.email ? ` <span class="about-author-email">(${escapeHtml(about.author.email)})</span>` : ''}</dd></div>
          <div><dt>Repository</dt><dd><a href="${escapeHtml(about.repository.url)}" target="_blank" rel="noreferrer">${escapeHtml(about.repository.url)}</a></dd></div>
        </dl>
      </section>
    </main>
  `;
}

/** Connects the About page's back control to the supplied navigation action. */
export function bindAboutPageEvents(root: ParentNode, onBack: () => void): void {
  root.querySelector<HTMLButtonElement>('#about-back')?.addEventListener('click', onBack);
}

/** Loads About metadata and refreshes only while the About page remains active. */
export async function openAboutPage(
  state: AboutPageState,
  actions: AboutPageActions,
): Promise<void> {
  state.view = 'about';
  state.about = null;
  actions.render();

  try {
    state.about = await actions.getAbout();
  } catch {
    state.about = {
      productName: 'Orbita',
      version: 'Unknown',
      repository: { type: 'git', url: '' },
      description: 'A Kubernetes cluster browser.',
      author: { name: 'Unknown', email: '' },
    };
  }

  if (state.view === 'about') {
    actions.render();
  }
}