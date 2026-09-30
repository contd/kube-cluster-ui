import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindAboutPageEvents,
  openAboutPage,
  renderAboutPage,
  type AboutPageState,
} from '../src/components/aboutpage';

const aboutInfo = {
  productName: 'Orbita',
  version: '2.5.0',
  repository: { type: 'git', url: 'https://example.test/repository' },
  description: 'A Kubernetes cluster browser.',
  author: { name: 'Example Author', email: 'author@example.test' },
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('About page', () => {
  it('renders a loading placeholder until metadata is available', () => {
    expect(renderAboutPage(null)).toContain('Loading application information...');
  });

  it('renders and escapes application metadata', () => {
    const html = renderAboutPage({ ...aboutInfo, productName: '<Kube UI>' });

    expect(html).toContain('&lt;Kube UI&gt;');
    expect(html).toContain('Version 2.5.0');
    expect(html).toContain('author@example.test');
    expect(html).not.toContain('<Kube UI>');
  });

  it('loads metadata and rerenders while the About view remains active', async () => {
    const state: AboutPageState = { view: 'dashboard', about: null };
    const render = vi.fn();

    await openAboutPage(state, {
      getAbout: async () => aboutInfo,
      render,
    });

    expect(state.view).toBe('about');
    expect(state.about).toEqual(aboutInfo);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('falls back to safe metadata when loading fails', async () => {
    const state: AboutPageState = { view: 'dashboard', about: null };

    await openAboutPage(state, {
      getAbout: async () => { throw new Error('unavailable'); },
      render: vi.fn(),
    });

    expect(state.about?.version).toBe('Unknown');
    expect(state.about?.author.name).toBe('Unknown');
  });

  it('binds the back button to the navigation callback', () => {
    document.body.innerHTML = '<button id="about-back"></button>';
    const onBack = vi.fn();
    bindAboutPageEvents(document, onBack);
    document.querySelector<HTMLButtonElement>('#about-back')?.click();

    expect(onBack).toHaveBeenCalledOnce();
  });
});