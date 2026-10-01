import { createIcons, icons } from 'lucide';

const panelStyles = `
  :host { display: inline-flex; align-items: center; }
  button {
    display: grid;
    width: 24px;
    height: 22px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #d9e2e7;
  }
  button:hover, button:focus-visible { background: rgba(255, 255, 255, 0.14); }
  button:focus-visible { outline: 2px solid #65d0b5; outline-offset: 1px; }
  svg { display: block; width: 16px; height: 16px; }
  .backdrop[hidden] { display: none; }
  .backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0 0 25px;
    display: grid;
    align-items: end;
    justify-items: center;
    background: rgba(7, 15, 20, 0.42);
  }
  .panel {
    position: relative;
    display: flex;
    width: 100%;
    height: 80vh;
    max-height: calc(100% - 8px);
    box-sizing: border-box;
    flex-direction: column;
    padding: 52px 12px 0;
    border: 1px solid #d7dde2;
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    background: #f7fafb;
    color: #263038;
    box-shadow: 0 -12px 36px rgba(9, 20, 27, 0.18);
    animation: rise 180ms ease-out both;
  }
  .panel-close {
    position: absolute;
    top: 10px;
    right: 12px;
    width: 32px;
    height: 32px;
  }
  ::slotted(.dashboard-terminal-grid) {
    width: 100%;
    flex: 1;
    min-height: 0;
    margin: 0;
  }
  :host([theme="dark"]) .panel {
    border-color: #35454e;
    background: #1b272e;
    color: #e7eff2;
  }
  @keyframes rise {
    from { transform: translateY(18px); opacity: 0.85; }
    to { transform: translateY(0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .panel { animation: none; }
  }
`;

export class TerminalPanel extends HTMLElement {
  static observedAttributes = ['open', 'theme'];

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${panelStyles}</style>
      <button type="button" aria-label="Kubectl terminal" aria-expanded="false" title="Kubectl terminal">
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M0 0h16v16H0z" fill="none" />
          <path fill="currentColor" d="M1 1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1m6.5 11a.5.5 0 1 1 0-1h5a.5.5 0 1 1 0 1zM3.146 5.354a.5.5 0 1 1 .708-.708L6.457 7.25a1 1 0 0 1 .003 1.397l-2.6 2.7a.5.5 0 1 1-.72-.694L5.743 7.95zM1 2v12h14V2z" />
        </svg>
      </button>
      <div class="backdrop" hidden>
        <section class="panel" role="dialog" aria-modal="true" aria-label="Kubectl terminal" tabindex="-1">
          <button class="panel-close" type="button" aria-label="Close" title="Close">
            <i data-lucide="x" aria-hidden="true"></i>
          </button>
          <slot></slot>
        </section>
      </div>
    `;
    createIcons({ icons, root: shadow });

    shadow.querySelector('button')?.addEventListener('click', () => {
      this.setOpen(true);
    });
    this.addEventListener('terminal-panel-request-open', () => {
      this.setOpen(true);
    });
    shadow.querySelector<HTMLButtonElement>('.panel-close')?.addEventListener('click', () => {
      this.setOpen(false);
    });
  }

  connectedCallback(): void {
    this.syncOpenState();
  }

  attributeChangedCallback(): void {
    this.syncOpenState();
  }

  private setOpen(open: boolean): void {
    this.toggleAttribute('open', open);
    this.dispatchEvent(new CustomEvent('panel-state-change', {
      detail: open,
      bubbles: true,
      composed: true,
    }));
  }

  private syncOpenState(): void {
    const open = this.hasAttribute('open');
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>('button');
    const backdrop = this.shadowRoot?.querySelector<HTMLDivElement>('.backdrop');
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.panel');

    if (button) {
      button.setAttribute('aria-expanded', String(open));
    }
    if (backdrop) {
      backdrop.hidden = !open;
    }
    if (open) {
      panel?.focus();
    } else if (button && this.isConnected) {
      button.focus();
    }
  }
}

if (!customElements.get('terminal-panel')) {
  customElements.define('terminal-panel', TerminalPanel);
}