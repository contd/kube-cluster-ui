/** Statusbar terminal launcher and overlay hosting the slotted terminal interface. */
import { createIcons, icons } from 'lucide';
import {
  escapeHtml,
  highlightYaml,
} from '../dataplane';
import type {
  CliToolsAvailability,
  KubeApi,
  KubectlResult,
} from '../app.types';

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
  button:focus:not(:focus-visible), .panel:focus { outline: none; }
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

type TerminalState = {
  input: string;
  history: string[];
  result: (KubectlResult & { command: string }) | null;
  error: string;
  running: boolean;
  requestId: number;
  outputExpanded: boolean;
};

export type TerminalViewOptions = {
  contextName: string;
  cliToolsAvailability: CliToolsAvailability | null;
  kubectlAvailabilityMessage: string;
};

export type TerminalActions = {
  api?: Pick<KubeApi, 'runKubectl'>;
  selectedContextId: string;
  render: () => void;
};

const terminalState: TerminalState = {
  input: '',
  history: [],
  result: null,
  error: '',
  running: false,
  requestId: 0,
  outputExpanded: true,
};

/** Renders the context-bound command prompt and syntax-highlighted output panes. */
export function renderKubectlTerminal(options: TerminalViewOptions): string {
  const kubectlDisabled = options.cliToolsAvailability?.kubectl.available !== true;
  const output = terminalState.result
    ? [terminalState.result.stdout, terminalState.result.stderr]
        .filter(Boolean)
        .join('\n')
    : '';

  return `
    <section class="dashboard-terminal-grid ${terminalState.outputExpanded ? 'expanded-output' : ''} ${kubectlDisabled ? 'kubectl-disabled' : ''}" aria-label="Kubectl terminal">
      <section class="dashboard-terminal-pane kubectl-command-pane">
        <header class="terminal-pane-heading">
          <h2><i data-lucide="terminal"></i> Terminal</h2>
          <div class="kubectl-terminal-header-actions">
            <button class="kubectl-clear-history" id="kubectl-clear-history" title="Clear history" aria-label="Clear history" ${kubectlDisabled || !terminalState.history.length ? 'disabled' : ''}>
              <i data-lucide="trash-2"></i><span>Clear history</span>
            </button>
            <span class="kubectl-context" title="${escapeHtml(options.contextName)}">
              <i data-lucide="network"></i>${escapeHtml(options.contextName)}
            </span>
          </div>
        </header>
        <div class="kubectl-terminal-screen" aria-live="polite">
          ${terminalState.history.length
            ? `<ol class="kubectl-history-list" aria-label="Command history">${terminalState.history
                .map((command) => `<li class="kubectl-history-entry"><span>$</span><code>${escapeHtml(command)}</code></li>`)
                .join('')}</ol>`
            : '<div class="kubectl-terminal-idle"><i data-lucide="chevron-right"></i><span>kubectl</span></div>'}
          ${terminalState.error ? `<p class="kubectl-terminal-error">${escapeHtml(terminalState.error)}</p>` : ''}
        </div>
        <form class="kubectl-command-form" id="kubectl-form">
          <label class="kubectl-command-field">
            <input id="kubectl-command" type="text" aria-label="Kubectl command" value="${escapeHtml(terminalState.input)}" placeholder="kubectl get pods -A" autocomplete="off" spellcheck="false" ${kubectlDisabled || terminalState.running ? 'disabled' : ''} />
          </label>
          <button class="primary-button kubectl-run-button" id="kubectl-run" type="submit" ${kubectlDisabled || terminalState.running ? 'disabled' : ''}>
            <i data-lucide="${terminalState.running ? 'loader-circle' : 'play'}"></i>
            ${terminalState.running ? 'Running' : 'Run'}
          </button>
        </form>
      </section>
      <section class="dashboard-terminal-pane kubectl-output-pane">
        <header class="terminal-pane-heading">
          <h2>
            <button class="kubectl-output-toggle" id="kubectl-output-toggle" aria-expanded="${terminalState.outputExpanded}" aria-label="${terminalState.outputExpanded ? 'Collapse output panel' : 'Expand output panel'}" ${kubectlDisabled ? 'disabled' : ''}>
              <i data-lucide="code-xml"></i><span>Output</span>
            </button>
          </h2>
          <div class="kubectl-output-actions">
            ${terminalState.result || terminalState.error
              ? `<button class="kubectl-clear-output" id="kubectl-clear-output" title="Clear terminal output" aria-label="Clear terminal output" ${kubectlDisabled ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>Clear</span></button>`
              : ''}
            ${terminalState.result
              ? `<span class="kubectl-exit-status ${terminalState.result.exitCode === 0 ? 'success' : 'failure'}">Exit ${terminalState.result.exitCode}</span>`
              : ''}
          </div>
        </header>
        <pre class="kubectl-output" id="kubectl-output" aria-live="polite">${terminalState.running
          ? '<span class="kubectl-output-muted">Running kubectl...</span>'
          : terminalState.error
            ? `<span class="kubectl-status-error">${escapeHtml(terminalState.error)}</span>`
            : terminalState.result
              ? highlightKubectlOutput(output)
              : '<span class="kubectl-output-muted">Awaiting output</span>'}</pre>
      </section>
      ${kubectlDisabled
        ? `<div class="kubectl-disabled-overlay" role="status" aria-live="polite">
            <div class="kubectl-disabled-message">
              <i data-lucide="terminal" aria-hidden="true"></i>
              <h2>${options.cliToolsAvailability ? 'Terminal unavailable' : 'Checking kubectl'}</h2>
              <p>${escapeHtml(options.kubectlAvailabilityMessage)}</p>
            </div>
          </div>`
        : ''}
    </section>
  `;
}

/** Invalidates any active command and clears the displayed terminal result. */
export function clearTerminalOutput(): void {
  terminalState.requestId += 1;
  terminalState.result = null;
  terminalState.error = '';
  terminalState.running = false;
}

/** Wires the command prompt and output controls to local state and the preload API. */
export function bindTerminalEvents(root: ParentNode, actions: TerminalActions): void {
  root.querySelector<HTMLButtonElement>('#kubectl-clear-history')?.addEventListener('click', () => {
    terminalState.history = [];
    actions.render();
  });

  root.querySelector<HTMLButtonElement>('#kubectl-clear-output')?.addEventListener('click', () => {
    clearTerminalOutput();
    actions.render();
  });

  root.querySelector<HTMLButtonElement>('#kubectl-output-toggle')?.addEventListener('click', () => {
    terminalState.outputExpanded = !terminalState.outputExpanded;
    actions.render();
  });

  root.querySelector<HTMLInputElement>('#kubectl-command')?.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.value.startsWith('k ')) {
      const selectionStart = target.selectionStart ?? target.value.length;
      const selectionEnd = target.selectionEnd ?? target.value.length;
      target.value = `kubectl ${target.value.slice(2)}`;
      target.setSelectionRange(selectionStart + 6, selectionEnd + 6);
    }
    terminalState.input = target.value;
  });

  root.querySelector<HTMLInputElement>('#kubectl-command')?.addEventListener('keydown', (event) => {
    const target = event.currentTarget as HTMLInputElement;
    if (
      event.key !== 'Tab' ||
      target.value !== 'k' ||
      target.selectionStart !== target.value.length ||
      target.selectionEnd !== target.value.length
    ) {
      return;
    }

    event.preventDefault();
    target.value = 'kubectl ';
    terminalState.input = target.value;
    target.setSelectionRange(target.value.length, target.value.length);
  });

  root.querySelector<HTMLFormElement>('#kubectl-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const command = terminalState.input.trim();
    if (!command || terminalState.running) {
      return;
    }

    terminalState.input = '';
    terminalState.history.push(command);
    if (terminalState.history.length > 1000) {
      terminalState.history.splice(0, terminalState.history.length - 1000);
    }
    terminalState.result = null;
    terminalState.error = '';
    terminalState.running = true;
    const requestId = ++terminalState.requestId;
    actions.render();
    scrollTerminalHistoryToBottom(root);

    void (async () => {
      try {
        if (!actions.api?.runKubectl) {
          throw new Error('Kubectl command execution is unavailable.');
        }

        const result = await actions.api.runKubectl(command, actions.selectedContextId);
        if (requestId === terminalState.requestId) {
          terminalState.result = { ...result, command };
        }
      } catch (error) {
        if (requestId === terminalState.requestId) {
          terminalState.error = error instanceof Error
            ? error.message
            : 'Unable to run kubectl command.';
        }
      } finally {
        if (requestId === terminalState.requestId) {
          terminalState.running = false;
          actions.render();
          scrollTerminalHistoryToBottom(root);
        }
      }
    })();
  });
}

/** Highlights JSON, Kubernetes YAML, table headers, and common status values. */
export function highlightKubectlOutput(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) {
    return '<span class="kubectl-output-muted">Command completed with no output.</span>';
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const formatted = JSON.stringify(JSON.parse(trimmed), null, 2);
      return escapeHtml(formatted).replace(
        /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?|\b(?:true|false|null)\b)/g,
        (match, stringToken: string | undefined, colon: string | undefined) => {
          if (!stringToken) {
            return `<span class="json-literal">${match}</span>`;
          }

          return colon
            ? `<span class="json-key">${stringToken}</span>${colon}`
            : `<span class="json-string">${stringToken}</span>`;
        },
      );
    } catch {
      return escapeHtml(output);
    }
  }

  if (/^(?:apiVersion|kind|metadata|items|spec|status|data|secrets):/m.test(trimmed)) {
    return highlightYaml(output);
  }

  const lines = output.split('\n');
  if (/^[A-Z][A-Z0-9 _-]*(?:\s{2,}[A-Z][A-Z0-9_-]*)+$/.test(lines[0]?.trim() || '')) {
    return lines
      .map((line, index) => {
        const escapedLine = escapeHtml(line).replace(
          /\b(Running|Ready|Active|Bound|Succeeded|Complete|Completed|Pending|Warning|Failed|Error)\b/gi,
          (status) => `<span class="kubectl-status-${status.toLowerCase()}">${status}</span>`,
        );
        return index === 0
          ? `<span class="kubectl-table-header">${escapedLine}</span>`
          : escapedLine;
      })
      .join('\n');
  }

  return escapeHtml(output).replace(
    /\b(Running|Ready|Active|Bound|Succeeded|Complete|Completed|Pending|Warning|Failed|Error)\b/gi,
    (status) => `<span class="kubectl-status-${status.toLowerCase()}">${status}</span>`,
  );
}

function scrollTerminalHistoryToBottom(root: ParentNode): void {
  const history = root.querySelector<HTMLElement>('.kubectl-terminal-screen');
  if (history) {
    history.scrollTop = history.scrollHeight;
  }
}

if (!customElements.get('terminal-panel')) {
  customElements.define('terminal-panel', TerminalPanel);
}