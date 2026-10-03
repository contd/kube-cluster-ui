/** Bottom drawer for recent Kubernetes container logs from a selected resource. */
import { createIcons, icons } from 'lucide';
import { kindLabel, resourceName, resourceNamespace } from '../dataplane';
import type { KubeApi, KubeResource, ResourceKind } from '../app.types';

const panelStyles = `
  :host { display: contents; }
  .backdrop[hidden] { display: none; }
  .backdrop {
    position: fixed;
    z-index: 1010;
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
    border: 1px solid #d7dde2;
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    background: #f7fafb;
    color: #263038;
    box-shadow: 0 -12px 36px rgba(9, 20, 27, 0.18);
    animation: rise 180ms ease-out both;
  }
  .panel:focus { outline: none; }
  .header {
    display: flex;
    min-height: 56px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 14px;
    border-bottom: 1px solid #d7dde2;
  }
  .heading { min-width: 0; }
  .heading span {
    display: block;
    color: #71808a;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .heading h2 {
    overflow: hidden;
    margin: 2px 0 0;
    font-size: 1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid #cfd7de;
    border-radius: 6px;
    background: #ffffff;
    color: #263038;
  }
  .close:hover { background: #f1f5f6; }
  .close:focus-visible { outline: 2px solid #4b9fca; outline-offset: 2px; }
  .close svg { width: 16px; height: 16px; }
  .output {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 14px 16px;
    background: #0d1418;
    color: #d5e1e4;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  :host([theme="dark"]) .panel { border-color: #35454e; background: #1b272e; color: #e7eff2; }
  :host([theme="dark"]) .header { border-color: #35454e; }
  :host([theme="dark"]) .close { border-color: #35454e; background: #24333a; color: #e7eff2; }
  @keyframes rise {
    from { transform: translateY(18px); opacity: 0.85; }
    to { transform: translateY(0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .panel { animation: none; }
  }
`;

const kubectlLogTypes: Partial<Record<ResourceKind, string>> = {
  pods: 'pod',
  deployments: 'deployment',
  daemonsets: 'daemonset',
  statefulsets: 'statefulset',
  replicasets: 'replicaset',
  jobs: 'job',
};

const logKindLabels: Partial<Record<ResourceKind, string>> = {
  nodes: 'Node',
  pods: 'Pod',
  deployments: 'Deployment',
  daemonsets: 'DaemonSet',
  statefulsets: 'StatefulSet',
  replicasets: 'ReplicaSet',
  jobs: 'Job',
};

type LogsApi = Pick<KubeApi, 'runKubectl'>;

export class LogsPanel extends HTMLElement {
  static observedAttributes = ['open', 'theme'];

  private requestId = 0;
  private opener: HTMLElement | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${panelStyles}</style>
      <div class="backdrop" hidden>
        <section class="panel" role="dialog" aria-modal="true" aria-label="Resource logs" tabindex="-1">
          <header class="header">
            <div class="heading">
              <span>Logs</span>
              <h2></h2>
            </div>
            <button class="close" type="button" aria-label="Close logs" title="Close logs">
              <i data-lucide="x" aria-hidden="true"></i>
            </button>
          </header>
          <pre class="output" aria-live="polite">Select a resource to view its logs.</pre>
        </section>
      </div>
    `;
    createIcons({ icons, root: shadow });
    shadow.querySelector<HTMLButtonElement>('.close')?.addEventListener('click', () => {
      this.close();
    });
  }

  connectedCallback(): void {
    this.syncOpenState();
  }

  attributeChangedCallback(): void {
    this.syncOpenState();
  }

  async openFor(
    resource: KubeResource,
    resourceKind: ResourceKind,
    contextId: string,
    api: LogsApi | undefined,
    opener: HTMLElement,
  ): Promise<void> {
    this.opener = opener;
    this.setAttribute('open', '');

    const requestId = ++this.requestId;
    const name = resourceName(resource);
    const kind = logKindLabels[resourceKind] || kindLabel(resourceKind);
    const title = `${kind}: ${name}`;
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.panel');
    const heading = this.shadowRoot?.querySelector<HTMLElement>('.heading h2');
    const output = this.shadowRoot?.querySelector<HTMLPreElement>('.output');
    panel?.setAttribute('aria-label', `Logs for ${title}`);
    if (heading) {
      heading.textContent = title;
    }
    if (output) {
      output.textContent = 'Loading logs...';
    }
    panel?.focus();

    if (resourceKind === 'nodes') {
      if (!api?.runKubectl) {
        this.setOutput('The kubectl API is unavailable.');
        return;
      }

      await this.loadNodeLogs(name, contextId, api, requestId);
      return;
    }

    const logType = kubectlLogTypes[resourceKind];
    if (!logType) {
      this.setOutput(`Logs are not available directly for ${kind} resources. Select a Pod or workload to view container logs.`);
      return;
    }

    if (!api?.runKubectl) {
      this.setOutput('The kubectl API is unavailable.');
      return;
    }

    const namespace = resourceNamespace(resource);
    const command = `kubectl logs ${logType}/${name} --namespace=${namespace} --all-containers=true --tail=500`;
    try {
      const result = await api.runKubectl(command, contextId);
      if (requestId !== this.requestId) {
        return;
      }

      const content = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      this.setOutput(content || (result.exitCode === 0
        ? 'No logs were returned for this resource.'
        : `kubectl logs exited with code ${result.exitCode}.`));
    } catch (error) {
      if (requestId === this.requestId) {
        this.setOutput(error instanceof Error ? error.message : 'Unable to load resource logs.');
      }
    }
  }

  private async loadNodeLogs(
    nodeName: string,
    contextId: string,
    api: LogsApi,
    requestId: number,
  ): Promise<void> {
    try {
      const podList = await api.runKubectl(
        `kubectl get pods --all-namespaces --field-selector spec.nodeName=${nodeName} --no-headers -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name`,
        contextId,
      );
      if (requestId !== this.requestId) {
        return;
      }
      if (podList.exitCode !== 0) {
        this.setOutput([podList.stdout, podList.stderr].filter(Boolean).join('\n') || 'Unable to list Pods on this Node.');
        return;
      }

      const pods = podList.stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => fields.length >= 2)
        .slice(0, 20);
      if (!pods.length) {
        this.setOutput('No Pods are currently scheduled on this Node.');
        return;
      }

      const podLogs = await Promise.all(pods.map(async ([namespace, name]) => {
        const result = await api.runKubectl(
          `kubectl logs pod/${name} --namespace=${namespace} --all-containers=true --tail=200`,
          contextId,
        );
        const content = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        return `=== ${namespace}/${name} ===\n${content || `No logs returned (exit ${result.exitCode}).`}`;
      }));

      if (requestId === this.requestId) {
        this.setOutput([
          ...podLogs,
          ...(podList.stdout.trim().split(/\r?\n/).length > pods.length
            ? ['Additional Pods omitted; showing the first 20.']
            : []),
        ].join('\n\n'));
      }
    } catch (error) {
      if (requestId === this.requestId) {
        this.setOutput(error instanceof Error ? error.message : 'Unable to load logs for this Node.');
      }
    }
  }

  private close(): void {
    this.requestId += 1;
    this.removeAttribute('open');
    if (this.opener?.isConnected) {
      this.opener.focus();
    }
  }

  private setOutput(text: string): void {
    const output = this.shadowRoot?.querySelector<HTMLPreElement>('.output');
    if (output) {
      output.textContent = text;
    }
  }

  private syncOpenState(): void {
    const open = this.hasAttribute('open');
    const backdrop = this.shadowRoot?.querySelector<HTMLDivElement>('.backdrop');
    if (backdrop) {
      backdrop.hidden = !open;
    }
  }
}

if (!customElements.get('logs-panel')) {
  customElements.define('logs-panel', LogsPanel);
}