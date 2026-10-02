/** Resource inspector rendering and copy/close controls for the selected item. */
import {
  age,
  escapeHtml,
  formatManifest,
  highlightYaml,
  kindLabel,
  metadata,
  resourceName,
  resourceNamespace,
  statusFor,
} from '../dataplane';
import type { KubeResource, ResourceKind } from '../app.types';

export type InspectorActions = {
  onClose: () => void;
  onCopy: (text: string) => void;
};

/** Renders the selected resource details, or an empty inspector when none is selected. */
export function renderInspector(
  resource: KubeResource | undefined,
  kind: ResourceKind,
): string {
  if (!resource) {
    return '<aside class="inspector"></aside>';
  }

  const labels = metadata(resource).labels || {};
  const manifest = formatManifest(resource);

  return `
    <aside class="inspector open">
      <div class="inspector-header">
        <div>
          <span>${escapeHtml(kindLabel(kind))}</span>
          <h2>${escapeHtml(resourceName(resource))}</h2>
        </div>
        <div class="inspector-actions">
          <button class="icon-button small" id="copy-name" title="Copy resource name" aria-label="Copy resource name">
            <i data-lucide="copy"></i>
          </button>
          <button class="icon-button small" id="close-inspector" title="Close inspector" aria-label="Close inspector">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>

      <div class="facts">
        ${renderFact('Namespace', resourceNamespace(resource))}
        ${renderFact('Status', statusFor(resource, kind))}
        ${renderFact('Age', age(metadata(resource).creationTimestamp))}
        ${renderFact('Labels', String(Object.keys(labels).length))}
      </div>

      <section class="detail-section">
        <h3>Labels</h3>
        <div class="labels">
          ${Object.entries(labels).length
            ? Object.entries(labels)
                .slice(0, 8)
                .map(([key, value]) => `<span>${escapeHtml(key)}=${escapeHtml(value)}</span>`)
                .join('')
            : '<span>none</span>'}
        </div>
      </section>

      ${resource.kind === 'Event' ? renderEventMessage(resource) : ''}

      <section class="detail-section manifest-section">
        <div class="section-heading">
          <h3>Manifest</h3>
          <button class="tool-button compact" id="copy-manifest">
            <i data-lucide="copy"></i>
            Copy
          </button>
        </div>
        <pre id="manifest">${highlightYaml(manifest)}</pre>
      </section>
    </aside>
  `;
}

/** Connects inspector close and copy controls to the owning renderer actions. */
export function bindInspectorEvents(
  root: ParentNode,
  resource: KubeResource | undefined,
  actions: InspectorActions,
): void {
  if (!resource) {
    return;
  }

  root.querySelector<HTMLButtonElement>('#close-inspector')?.addEventListener('click', actions.onClose);
  root.querySelector<HTMLButtonElement>('#copy-name')?.addEventListener('click', () => {
    actions.onCopy(resourceName(resource));
  });
  root.querySelector<HTMLButtonElement>('#copy-manifest')?.addEventListener('click', () => {
    actions.onCopy(formatManifest(resource));
  });
}

function renderEventMessage(resource: KubeResource): string {
  return `
    <section class="detail-section">
      <h3>Message</h3>
      <p class="event-message">${escapeHtml(resource.message || 'No event message available.')}</p>
    </section>
  `;
}

function renderFact(label: string, value: string): string {
  return `
    <div class="fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}