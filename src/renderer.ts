import { createIcons, icons } from 'lucide';
import YAML from 'yaml';
import * as dataplane from './dataplane';
import type {
  AboutInfo,
  ClusterContext,
  Column,
  Density,
  KubeResource,
  Metadata,
  NavItem,
  ResourceKind,
  Snapshot,
  SortDirection,
  StatusTone,
  Theme,
} from './app.types';
export type {
  AboutInfo,
  ClusterContext,
  Column,
  Density,
  KubeApi,
  KubeResource,
  Metadata,
  NavItem,
  ResourceKind,
  Snapshot,
  SortDirection,
  StatusTone,
  Theme,
} from './app.types';
// CSS is bundled by the build tool; TypeScript has no declaration for this side-effect import.
// @ts-expect-error -- the bundler resolves the stylesheet at build time.
import './index.css';

const navItems = dataplane.navItems;

const app = document.querySelector<HTMLDivElement>('#app');

const state = {
  selectedKind: 'pods' as ResourceKind,
  selectedResourceId: '',
  namespace: 'all',
  query: '',
  selectedContextId: '',
  contexts: [] as ClusterContext[],
  snapshot: createDemoSnapshot(),
  loading: true,
  error: '',
  theme: (localStorage.getItem('kube-cluster-ui-theme') === 'dark' ? 'dark' : 'light') as Theme,
  density: ((localStorage.getItem('kube-cluster-ui-density') as Density | null) || 'cozy') as Density,
  kubeconfigDialog: false,
  kubeconfigError: '',
  sortColumn: 'Name',
  sortDirection: 'ascending' as SortDirection,
  section: 'dashboard' as 'dashboard' | ResourceKind,
  view: 'dashboard' as 'dashboard' | 'about',
  about: null as AboutInfo | null,
};

/** Applies the selected theme to the document and persists it for the next launch. */
function applyTheme(theme: Theme): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('kube-cluster-ui-theme', theme);
}

/** Applies the density mode to the document and persists the user's display preference. */
function applyDensity(density: Density): void {
  state.density = density;
  document.documentElement.dataset.density = density;
  localStorage.setItem('kube-cluster-ui-density', density);
}

/** Walks a nested Kubernetes object safely and returns the value at the requested path. */
export function objectValue(
  value: Record<string, unknown> | undefined,
  path: string[],
): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }

    return undefined;
  }, value);
}

/** Converts API values into display text while normalizing missing and array values. */
export function stringValue(value: unknown, fallback = '-'): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
}

/** Returns resource metadata or an empty object so callers can render incomplete API data safely. */
export function metadata(resource: KubeResource): Metadata {
  return resource.metadata || {};
}

/** Resolves the human-readable name, preferring an Event's involved object when available. */
export function resourceName(resource: KubeResource): string {
  if (resource.kind === 'Event') {
    return resource.involvedObject?.name || metadata(resource).name || '-';
  }

  return metadata(resource).name || '-';
}

/** Resolves a resource namespace and supplies cluster/default fallbacks for unscoped resources. */
export function resourceNamespace(resource: KubeResource): string {
  return (
    metadata(resource).namespace ||
    resource.involvedObject?.namespace ||
    (resource.kind === 'Node' ? 'cluster' : 'default')
  );
}

/** Builds the stable namespace/name key used to select a resource in the inspector. */
export function resourceId(resource: KubeResource): string {
  return `${resourceNamespace(resource)}:${metadata(resource).name || resourceName(resource)}`;
}

/** Formats an ISO timestamp as a compact elapsed time suitable for table cells. */
export function age(isoDate?: string): string {
  if (!isoDate) {
    return '-';
  }

  const created = new Date(isoDate).getTime();
  const delta = Date.now() - created;
  const minutes = Math.max(1, Math.floor(delta / 60000));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

/** Counts ready pod containers and formats the result as ready/total. */
export function podReady(resource: KubeResource): string {
  const statuses = objectValue(resource.status, ['containerStatuses']);
  if (!Array.isArray(statuses)) {
    return '-';
  }

  const ready = statuses.filter((status) => {
    return Boolean((status as Record<string, unknown>).ready);
  }).length;

  return `${ready}/${statuses.length}`;
}

/** Reads workload replica counts from status/spec and formats them as ready/desired. */
export function workloadReady(resource: KubeResource): string {
  const ready = stringValue(objectValue(resource.status, ['readyReplicas']), '0');
  const desired = stringValue(
    objectValue(resource.status, ['replicas']) ||
      objectValue(resource.spec, ['replicas']),
    '0',
  );

  return `${ready}/${desired}`;
}

/** Interprets a node's Ready condition as the status text shown in the UI. */
export function nodePressure(resource: KubeResource): string {
  const conditions = objectValue(resource.status, ['conditions']);
  if (!Array.isArray(conditions)) {
    return 'Unknown';
  }

  const ready = conditions.find((condition) => {
    const typed = condition as Record<string, unknown>;
    return typed.type === 'Ready';
  }) as Record<string, unknown> | undefined;

  return ready?.status === 'True' ? 'Ready' : 'NotReady';
}

/** Selects the status field appropriate to each Kubernetes resource category. */
export function statusFor(resource: KubeResource, kind: ResourceKind): string {
  if (kind === 'pods') {
    return stringValue(objectValue(resource.status, ['phase']));
  }

  if (kind === 'nodes') {
    return nodePressure(resource);
  }

  if (kind === 'namespaces') {
    return stringValue(objectValue(resource.status, ['phase']));
  }

  if (kind === 'events') {
    return resource.type || 'Normal';
  }

  if (kind === 'pvcs') {
    return stringValue(objectValue(resource.status, ['phase']));
  }

  if (kind === 'pvs') {
    return dataplane.pvStatus(resource);
  }

  if (kind === 'secrets') {
    return stringValue(resource.type);
  }

  if (['deployments', 'daemonsets', 'statefulsets'].includes(kind)) {
    return workloadReady(resource);
  }

  return stringValue(objectValue(resource.spec, ['type']));
}

/** Maps a resource status to the semantic color tone used by badges and status dots. */
export function statusTone(resource: KubeResource, kind: ResourceKind): StatusTone {
  const status = statusFor(resource, kind).toLowerCase();

  if (
    status.includes('running') ||
    status.includes('ready') ||
    status.includes('bound') ||
    status.includes('normal') ||
    status.includes('clusterip') ||
    status.includes('loadbalancer') ||
    status.includes('1/1') ||
    status.includes('2/2') ||
    status.includes('3/3')
  ) {
    return 'healthy';
  }

  if (
    status.includes('pending') ||
    status.includes('warning') ||
    status.includes('0/')
  ) {
    return 'warning';
  }

  if (
    status.includes('failed') ||
    status.includes('error') ||
    status.includes('notready') ||
    status.includes('backoff')
  ) {
    return 'danger';
  }

  return 'neutral';
}

/** Defines the table columns and value readers for a resource category. */
export function columnsFor(kind: ResourceKind): Column[] {
  const common: Column[] = [
    { label: 'Namespace', value: resourceNamespace },
    { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
  ];

  if (kind === 'nodes') {
    return [
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      {
        label: 'Roles',
        value: (resource) =>
          Object.keys(metadata(resource).labels || {})
            .filter((label) => label.startsWith('node-role.kubernetes.io/'))
            .map((label) => label.replace('node-role.kubernetes.io/', ''))
            .join(', ') || 'worker',
      },
      {
        label: 'Taints',
        value: (resource) => {
          const taints = objectValue(resource.spec, ['taints']);
          return Array.isArray(taints) ? String(taints.length) : '0';
        },
      },
      {
        label: 'Version',
        value: (resource) =>
          stringValue(objectValue(resource.status, ['nodeInfo', 'kubeletVersion'])),
      },
      {
        label: 'CPU',
        value: (resource) =>
          stringValue(objectValue(resource.status, ['capacity', 'cpu'])),
      },
      {
        label: 'Memory',
        value: (resource) =>
          dataplane.humanReadableMemory(
            objectValue(resource.status, ['allocatable', 'memory']) ||
              objectValue(resource.status, ['capacity', 'memory']),
          ),
      },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'pods') {
    return [
      ...common,
      { label: 'Containers', value: dataplane.podContainerCount },
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      {
        label: 'Restarts',
        value: (resource) => {
          const statuses = objectValue(resource.status, ['containerStatuses']);
          if (!Array.isArray(statuses)) {
            return '0';
          }

          return String(
            statuses.reduce((total, status) => {
              const restartCount = Number(
                (status as Record<string, unknown>).restartCount || 0,
              );
              return total + restartCount;
            }, 0),
          );
        },
      },
      { label: 'Node', value: (resource) => stringValue(objectValue(resource.spec, ['nodeName'])) },
      { label: 'Controlled By', value: dataplane.controlledBy },
    ];
  }

  if (kind === 'daemonsets') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Desired', value: dataplane.daemonsetDesired },
      { label: 'Current', value: dataplane.daemonsetCurrent },
      { label: 'Ready', value: dataplane.daemonsetReady },
      { label: 'Up-to-Date', value: dataplane.daemonsetUpToDate },
      { label: 'Available', value: dataplane.daemonsetAvailable },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'replicasets') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Desired', value: dataplane.replicasetDesired },
      { label: 'Current', value: dataplane.replicasetCurrent },
      { label: 'Ready', value: dataplane.replicasetReady },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'jobs') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Start Time', value: dataplane.jobStartTime },
      { label: 'End Time', value: dataplane.jobEndTime },
      { label: 'Ready', value: dataplane.jobReady },
      { label: 'Succeded', value: dataplane.jobSucceeded },
      { label: 'Terminating', value: dataplane.jobTerminating },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'cronjobs') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Schedule', value: dataplane.cronJobSchedule },
      { label: 'Suspend', value: dataplane.cronJobSuspend },
      { label: 'Active', value: dataplane.cronJobActive },
      { label: 'Last Schedule', value: dataplane.cronJobLastSchedule },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'pvs') {
    return [
      { label: 'Storage Class', value: dataplane.pvStorageClass },
      { label: 'Capacity', value: dataplane.pvCapacity },
      { label: 'Claim', value: dataplane.pvClaim },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
      { label: 'Status', value: dataplane.pvStatus },
    ];
  }

  if (kind === 'storageclasses') {
    return [
      { label: 'Provisioner', value: dataplane.storageClassProvisioner },
      { label: 'Reclaim Policy', value: dataplane.storageClassReclaimPolicy },
      { label: 'Volume Binding Mode', value: dataplane.storageClassBindingMode },
      { label: 'Allow Volume Expansion', value: dataplane.storageClassExpansion },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'namespaces') {
    return [
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
      { label: 'Labels', value: dataplane.labelsSummary },
    ];
  }

  if (['deployments', 'statefulsets'].includes(kind)) {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Pods', value: dataplane.workloadPods },
      { label: 'Replicas', value: dataplane.workloadReplicas },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'services') {
    return [
      ...common,
      { label: 'Type', value: (resource) => statusFor(resource, kind) },
      {
        label: 'Cluster IP',
        value: (resource) => stringValue(objectValue(resource.spec, ['clusterIP'])),
      },
      {
        label: 'Ports',
        value: (resource) => {
          const ports = objectValue(resource.spec, ['ports']);
          if (!Array.isArray(ports)) {
            return '-';
          }

          return ports
            .map((port) => {
              const typed = port as Record<string, unknown>;
              return `${typed.port}${typed.nodePort ? `:${typed.nodePort}` : ''}/${typed.protocol || 'TCP'}`;
            })
            .join(', ');
        },
      },
    ];
  }

  if (kind === 'ingresses') {
    return [
      ...common,
      {
        label: 'Class',
        value: (resource) => stringValue(objectValue(resource.spec, ['ingressClassName'])),
      },
      {
        label: 'Hosts',
        value: (resource) => {
          const rules = objectValue(resource.spec, ['rules']);
          if (!Array.isArray(rules)) {
            return '-';
          }

          return rules
            .map((rule) => stringValue((rule as Record<string, unknown>).host))
            .join(', ');
        },
      },
    ];
  }

  if (kind === 'configmaps') {
    return [
      ...common,
      {
        label: 'Keys',
        value: (resource) => String(Object.keys(resource.data || {}).length),
      },
    ];
  }

  if (kind === 'secrets') {
    return [
      ...common,
      { label: 'Type', value: (resource) => statusFor(resource, kind) },
      {
        label: 'Keys',
        value: (resource) => String(Object.keys(resource.data || {}).length),
      },
    ];
  }

  if (kind === 'pvcs') {
    return [
      ...common,
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      {
        label: 'Capacity',
        value: (resource) =>
          stringValue(objectValue(resource.status, ['capacity', 'storage'])),
      },
      {
        label: 'StorageClass',
        value: (resource) =>
          stringValue(objectValue(resource.spec, ['storageClassName'])),
      },
    ];
  }

  return [
    { label: 'Namespace', value: resourceNamespace },
    { label: 'Type', value: (resource) => resource.type || 'Normal' },
    { label: 'Reason', value: (resource) => resource.reason || '-' },
    { label: 'Object', value: resourceName },
    { label: 'Count', value: (resource) => String(resource.count || 1) },
    {
      label: 'Last Seen',
      value: (resource) =>
        age(resource.lastTimestamp || metadata(resource).creationTimestamp),
    },
  ];
}

/** Escapes untrusted Kubernetes values before inserting them into HTML strings. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return entities[character];
  });
}

/** Builds a sanitized YAML manifest, omitting server-managed metadata before display/copy. */
export function formatManifest(resource: KubeResource): string {
  const manifest = {
    apiVersion: resource.apiVersion ?? 'v1',
    kind: resource.kind ?? 'Resource',
    metadata: { ...metadata(resource) },
    ...(resource.spec ? { spec: resource.spec } : {}),
    ...(resource.status ? { status: resource.status } : {}),
    ...(resource.data ? { data: resource.data } : {}),
    ...Object.fromEntries(
      Object.entries(resource).filter(
        ([key]) =>
          !['apiVersion', 'kind', 'metadata', 'spec', 'status', 'data'].includes(key),
      ),
    ),
  } as Record<string, unknown> & {
    metadata: Record<string, unknown>;
  };

  delete manifest.metadata.managedFields;

  return YAML.stringify(manifest);
}

/** Adds lightweight syntax classes to escaped YAML for the manifest preview. */
export function highlightYaml(yaml: string): string {
  return yaml
    .split('\n')
    .map((line) => {
      let highlighted = escapeHtml(line);

      highlighted = highlighted.replace(
        /^(\s*)([-]?\s*)([^:#]+)(:)/,
        '$1$2<span class="yaml-key">$3</span>$4',
      );
      highlighted = highlighted.replace(
        /(:\s+)(["'].*?["']|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)(?=\s*$)/,
        '$1<span class="yaml-value">$2</span>',
      );
      highlighted = highlighted.replace(
        /(#.*)$/,
        '<span class="yaml-comment">$1</span>',
      );

      return highlighted;
    })
    .join('\n');
}

/** Rebuilds the active dashboard or about view and reconnects its DOM event handlers. */
function render() {
  if (!app) {
    return;
  }

  if (state.view === 'about') {
    app.innerHTML = renderAbout();
    createIcons({ icons });
    bindAboutEvents();
    return;
  }

  const currentNav = navItems.find((item) => item.kind === (state.section === 'dashboard' ? 'dashboard' : state.selectedKind));
  const resources = dataplane.getVisibleResources(state.snapshot, state.selectedKind, state.namespace, state.query);
  const selected = dataplane.selectedResource(resources, state.selectedResourceId);

  const groupedNav = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }

    acc[item.group].push(item);
    return acc;
  }, {});

  const contextPicker = `
    <div class="context-picker">
      <label class="context-control">
        <select id="context-select" aria-label="Server context">
          ${state.contexts.length
            ? state.contexts
                .map((context) => {
                  const selected = context.id === state.selectedContextId ? 'selected' : '';
                  return `<option value="${context.id}" ${selected}>${escapeHtml(contextLabel(context))}</option>`;
                })
                .join('')
            : '<option value="">No contexts found</option>'}
        </select>
      </label>
    </div>
  `;

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 512 512">
              <path d="M0 0h512v512H0z" fill="none" />
              <path fill="#fff" fill-rule="evenodd" d="M37.1 25.2C16.6 25.2 0 41.8 0 62.3v387.3c0 20.5 16.6 37.1 37.1 37.1h437.7c20.5 0 37.1-16.6 37.1-37.1V62.3c0-20.5-16.6-37.1-37.1-37.1zm308 310.9c3.4-9.4 5.3-19.5 5.3-30.1c0-48.9-39.6-88.5-88.5-88.5c-10.2 0-19.9 1.7-29 4.9l-29.3-76.2c16-5.4 27.5-20.5 27.5-38.3c0-22.3-18.1-40.4-40.4-40.4s-40.4 18.1-40.4 40.4s18.1 40.4 40.4 40.4q2.55 0 5.1-.3l29.8 77.3c-20 9-36 25.2-44.8 45.4l-58.3-22q.9-3.9.9-8.1c0-19.1-15.5-34.6-34.6-34.6s-34.6 15.5-34.6 34.6s15.5 34.6 34.6 34.6c13.5 0 25.3-7.8 31-19.1l58.2 22c-2.9 8.8-4.5 18.1-4.5 27.9c0 14.3 3.4 27.8 9.4 39.8L139 373.2c-7.3-10.4-19.4-17.2-33.1-17.2c-22.3 0-40.4 18.1-40.4 40.4s18.1 40.4 40.4 40.4s40.4-18.1 40.4-40.4c0-5.8-1.2-11.3-3.4-16.2l43.7-27.4a88.38 88.38 0 0 0 75.2 41.7c35.5 0 66.1-20.9 80.2-51l40.1 16q-.9 3.9-.9 8.1c0 19.1 15.5 34.6 34.6 34.6s34.6-15.5 34.6-34.6s-15.5-34.6-34.6-34.6c-13.5 0-25.3 7.8-31 19.1z" />
            </svg>
          </div>
          <div>
            <div class="brand-title">Kube Cluster UI</div>
            <div class="brand-subtitle">${escapeHtml(state.snapshot.context)}</div>
          </div>
        </div>

        ${state.kubeconfigDialog ? `
          <div class="dialog-backdrop" id="kubeconfig-dialog-backdrop">
            <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="kubeconfig-dialog-title">
              <div class="dialog-header">
                <div>
                  <div class="eyebrow">Server</div>
                  <h2 id="kubeconfig-dialog-title">Add kubeconfig</h2>
                </div>
                <button class="icon-button" id="close-kubeconfig" title="Close" aria-label="Close"><i data-lucide="x"></i></button>
              </div>
              <p class="dialog-copy">Paste a kubeconfig to save it as a server.</p>
              <textarea id="kubeconfig-input" placeholder="apiVersion: v1\nkind: Config\n..."></textarea>
              ${state.kubeconfigError ? `<div class="dialog-error">${escapeHtml(state.kubeconfigError)}</div>` : ''}
              <div class="dialog-actions">
                <button class="tool-button" id="cancel-kubeconfig">Cancel</button>
                <button class="primary-button" id="save-kubeconfig">Save server</button>
              </div>
            </section>
          </div>
        ` : ''}

        <nav class="navigation">
          ${Object.entries(groupedNav)
            .map(([group, items]) => {
              return `
                <section class="nav-group">
                  <div class="nav-group-heading">
                    <h2>${escapeHtml(group)}</h2>
                    ${group === 'Cluster' ? `
                      <button class="context-add" id="add-context" title="Add kubeconfig" aria-label="Add kubeconfig">
                        <i data-lucide="plus"></i>
                      </button>
                    ` : ''}
                  </div>
                  ${group === 'Cluster' ? contextPicker : ''}
                  ${items
                    .map((item) => {
                      const count = item.kind === 'dashboard'
                        ? ''
                        : dataplane.getResources(state.snapshot, item.kind).length;
                      const active = item.kind === state.section ? 'active' : '';

                      return `
                        <button class="nav-item ${active}" data-kind="${item.kind}">
                          <span class="nav-label">
                            <i data-lucide="${item.icon}"></i>
                            ${escapeHtml(item.label)}
                          </span>
                          ${item.kind === 'dashboard' ? '' : `<span class="nav-count">${count}</span>`}
                        </button>
                      `;
                    })
                    .join('')}
                </section>
              `;
            })
            .join('')}
        </nav>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div>
            <div class="eyebrow">Cluster</div>
            <h1>${escapeHtml(currentNav?.label || 'Resources')}</h1>
          </div>

          <div class="top-actions">
            <label class="control" aria-label="Namespace">
              <i data-lucide="layers-2" aria-hidden="true"></i>
              <select id="namespace" aria-label="Namespace">
                ${dataplane.namespaceOptions(state.snapshot)
                  .map((namespace) => {
                    const selectedOption = namespace === state.namespace ? 'selected' : '';
                    const label = namespace === 'all' ? 'All namespaces' : namespace;
                    return `<option value="${namespace}" ${selectedOption}>${escapeHtml(label)}</option>`;
                  })
                  .join('')}
              </select>
            </label>

            <label class="search">
              <i data-lucide="search"></i>
              <input id="search" type="search" placeholder="Search resources" value="${escapeHtml(state.query)}" />
            </label>

            <button class="icon-button ${state.loading ? 'spinning' : ''}" id="refresh" title="Refresh cluster data" aria-label="Refresh cluster data">
              <i data-lucide="refresh-cw"></i>
            </button>

            <button class="icon-button" id="theme-toggle" title="Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode" aria-label="Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode">
              <i data-lucide="${state.theme === 'dark' ? 'sun' : 'moon'}"></i>
            </button>

            <label class="control density-control" aria-label="Density">
              <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
              <select id="density-select" aria-label="Density" value="${state.density}">
                <option value="cozy" ${state.density === 'cozy' ? 'selected' : ''}>Cozy</option>
                <option value="normal" ${state.density === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="compact" ${state.density === 'compact' ? 'selected' : ''}>Compact</option>
              </select>
            </label>
          </div>
        </header>

        ${state.error ? `<div class="banner"><i data-lucide="info"></i>${escapeHtml(state.error)}</div>` : ''}

        ${state.section === 'dashboard' ? renderSummary() : ''}

        ${state.section === 'dashboard' ? '' : `<section class="content">
          <section class="resource-panel">
            <div class="panel-header">
              <div>
                <h2>${escapeHtml(currentNav?.label || 'Resources')}</h2>
                <p>${resources.length} shown of ${dataplane.getResources(state.snapshot, state.selectedKind).length}</p>
              </div>
              <div class="panel-tools">
                <button class="tool-button" id="clear-search">
                  <i data-lucide="x"></i>
                  Clear
                </button>
              </div>
            </div>

            <div class="table-wrap">
              ${renderTable(resources)}
            </div>
          </section>

          <aside class="inspector ${selected ? 'open' : ''}">
            ${renderInspector(selected)}
          </aside>
        </section>`}
      </main>

      <footer class="status-bar connection ${state.loading ? 'loading' : state.snapshot.mode}" aria-live="polite">
        <span></span>
        ${
          state.loading
            ? 'Loading cluster data'
            : state.snapshot.mode === 'live'
              ? 'Connected via kubectl'
              : 'Demo data'
        }
      </footer>
    </div>
  `;

  createIcons({ icons });
  bindEvents();
}

/** Produces the static about-page markup from the asynchronously loaded application metadata. */
function renderAbout(): string {
  const about = state.about;
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
        <div class="about-mark"><i data-lucide="network"></i></div>
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

/** Connects the about-page navigation control back to the dashboard. */
function bindAboutEvents(): void {
  document.querySelector<HTMLButtonElement>('#about-back')?.addEventListener('click', () => {
    state.view = 'dashboard';
    render();
  });
}

/** Switches to the about view, loads metadata through preload, and falls back gracefully. */
async function openAbout(): Promise<void> {
  state.view = 'about';
  state.about = null;
  render();

  try {
    if (!window.appInfo) {
      throw new Error('Application information is unavailable.');
    }

    state.about = await window.appInfo.getAbout();
  } catch {
    state.about = {
      productName: 'Kube Cluster UI',
      version: 'Unknown',
      repository: { type: 'git', url: '' },
      description: 'A Kubernetes cluster browser.',
      author: { name: 'Unknown', email: '' },
    };
  }

  if (state.view === 'about') {
    render();
  }
}

/** Converts the current health summary into the four dashboard summary cards. */
function renderSummary(): string {
  const summary = dataplane.healthSummary(state.snapshot);
  const podPercent = summary.pods.length
    ? Math.round((summary.runningPods / summary.pods.length) * 100)
    : 0;
  const nodePercent = summary.nodes.length
    ? Math.round((summary.readyNodes / summary.nodes.length) * 100)
    : 0;
  const workloadPercent = summary.workloads.length
    ? Math.round((summary.readyWorkloads / summary.workloads.length) * 100)
    : 0;

  return `
    <section class="summary-grid">
      ${summaryCard('Pods Running', `${summary.runningPods}/${summary.pods.length}`, podPercent, 'activity', 'healthy')}
      ${summaryCard('Nodes Ready', `${summary.readyNodes}/${summary.nodes.length}`, nodePercent, 'server', 'neutral')}
      ${summaryCard('Workloads Ready', `${summary.readyWorkloads}/${summary.workloads.length}`, workloadPercent, 'boxes', 'healthy')}
      ${summaryCard('Warnings', String(summary.warnings), summary.warnings ? 34 : 100, 'triangle-alert', summary.warnings ? 'warning' : 'healthy')}
    </section>
  `;
}

/** Renders one metric card with a bounded progress meter and semantic tone. */
function summaryCard(
  title: string,
  value: string,
  percent: number,
  icon: string,
  tone: StatusTone,
): string {
  return `
    <article class="summary-card ${tone}">
      <div class="summary-top">
        <span>${escapeHtml(title)}</span>
        <i data-lucide="${icon}"></i>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <div class="meter" aria-hidden="true">
        <span style="width: ${Math.min(100, Math.max(0, percent))}%"></span>
      </div>
    </article>
  `;
}

/** Sorts visible resources and renders the resource table, including selection/status state. */
function renderTable(resources: KubeResource[]): string {
  const columns = columnsFor(state.selectedKind);
  const sortableColumns = [
    { label: 'Name', value: resourceName },
    ...columns,
  ];

  const sortedResources = [...resources].sort((left, right) => {
    const column = sortableColumns.find((item) => item.label === state.sortColumn) || sortableColumns[0];
    const leftValue = column.value(left);
    const rightValue = column.value(right);
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    const comparison =
      Number.isNaN(leftNumber) || Number.isNaN(rightNumber)
        ? leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
        : leftNumber - rightNumber;

    return state.sortDirection === 'ascending' ? comparison : -comparison;
  });

  const sortIndicator = (label: string): string => {
    if (label !== state.sortColumn) {
      return '';
    }

    return state.sortDirection === 'ascending' ? ' ↑' : ' ↓';
  };

  if (!resources.length) {
    return `
      <div class="empty-state">
        <i data-lucide="scan-search"></i>
        <h3>No resources found</h3>
        <p>Try another namespace or search term.</p>
      </div>
    `;
  }

  return `
    <table>
      <thead>
        <tr>
          ${sortableColumns
            .map((column) => {
              return `<th><button class="sort-button" data-sort-column="${escapeHtml(column.label)}" aria-label="Sort by ${escapeHtml(column.label)}">${escapeHtml(column.label)}${sortIndicator(column.label)}</button></th>`;
            })
            .join('')}
        </tr>
      </thead>
      <tbody>
        ${sortedResources
          .map((resource) => {
            const active = resourceId(resource) === state.selectedResourceId ? 'active' : '';
            const status = statusFor(resource, state.selectedKind);
            const tone = statusTone(resource, state.selectedKind);
            const containerStatuses = objectValue(resource.status, ['containerStatuses']);
            const containerCount = Array.isArray(containerStatuses) ? containerStatuses.length : 0;
            const labels = metadata(resource).labels || {};
            const labelsPopover = Object.entries(labels)
              .map(([key, value]) => `<li>${escapeHtml(key)}=${escapeHtml(value)}</li>`)
              .join('') || '<li>None</li>';

            return `
              <tr class="${active}" data-resource-id="${escapeHtml(resourceId(resource))}">
                <td>
                  <div class="name-cell">
                    <span class="status-dot ${tone}"></span>
                    <div>
                      <strong>${escapeHtml(resourceName(resource))}</strong>
                      <span></span>
                    </div>
                  </div>
                </td>
                ${columns
                  .map((column) => {
                    const value = column.label === 'Labels' && state.selectedKind === 'namespaces'
                      ? `<span class="labels-preview"><span>${escapeHtml(dataplane.labelsSummary(resource))}</span><span class="labels-popover"><ul>${labelsPopover}</ul></span></span>`
                      : column.label === 'Containers' && state.selectedKind === 'pods'
                      ? `<span class="pod-container-squares" aria-label="${containerCount} containers">${Array.from({ length: containerCount }, () => '<span class="pod-container-square"></span>').join('')}</span>`
                      : column.label === 'Status' || column.label === 'Type'
                      ? `<span class="pill ${tone}">${escapeHtml(status)}</span>`
                      : escapeHtml(column.value(resource));

                    return `<td>${value}</td>`;
                  })
                  .join('')}
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

/** Renders the selected resource's facts, labels, event message, and YAML manifest. */
function renderInspector(resource: KubeResource | undefined): string {
  if (!resource) {
    return '';
  }

  const kind = state.selectedKind;
  const labels = metadata(resource).labels || {};
  const manifest = formatManifest(resource);

  return `
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
      ${fact('Namespace', resourceNamespace(resource))}
      ${fact('Status', statusFor(resource, kind))}
      ${fact('Age', age(metadata(resource).creationTimestamp))}
      ${fact('Labels', String(Object.keys(labels).length))}
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

    ${kind === 'events' ? renderEventMessage(resource) : ''}

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
  `;
}

/** Produces the optional event message section for the inspector. */
function renderEventMessage(resource: KubeResource): string {
  return `
    <section class="detail-section">
      <h3>Message</h3>
      <p class="event-message">${escapeHtml(resource.message || 'No event message available.')}</p>
    </section>
  `;
}

/** Renders one label/value pair in the inspector facts grid. */
function fact(label: string, value: string): string {
  return `
    <div class="fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

/** Re-exports the data-plane label resolver for existing renderer consumers. */
export const kindLabel = dataplane.kindLabel;
/** Re-exports the data-plane context label resolver for existing renderer consumers. */
export const contextLabel = dataplane.contextLabel;

/** Wires all dashboard controls to state updates, data loading, selection, and clipboard actions. */
function bindEvents() {
  document.querySelector<HTMLButtonElement>('#add-context')?.addEventListener('click', () => {
    state.kubeconfigDialog = true;
    state.kubeconfigError = '';
    render();
    document.querySelector<HTMLTextAreaElement>('#kubeconfig-input')?.focus();
  });

  const closeKubeconfigDialog = () => {
    state.kubeconfigDialog = false;
    state.kubeconfigError = '';
    render();
  };

  document.querySelector<HTMLButtonElement>('#close-kubeconfig')?.addEventListener('click', closeKubeconfigDialog);
  document.querySelector<HTMLButtonElement>('#cancel-kubeconfig')?.addEventListener('click', closeKubeconfigDialog);
  document.querySelector<HTMLButtonElement>('#save-kubeconfig')?.addEventListener('click', async () => {
    const input = document.querySelector<HTMLTextAreaElement>('#kubeconfig-input');
    const kubeconfig = input?.value.trim() || '';
    if (!kubeconfig || !window.kubeApi) {
      state.kubeconfigError = kubeconfig ? 'Preload API is unavailable.' : 'Paste a kubeconfig before saving.';
      render();
      return;
    }

    try {
      const result = await window.kubeApi.addKubeconfig(kubeconfig);
      state.contexts = result.contexts;
      state.selectedContextId = result.selectedContextId;
      state.kubeconfigDialog = false;
      state.kubeconfigError = '';
      await loadSnapshot();
    } catch (error) {
      state.kubeconfigError = error instanceof Error ? error.message : 'Unable to save kubeconfig.';
      render();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.kind;
      if (kind === 'dashboard') {
        state.section = 'dashboard';
        state.selectedResourceId = '';
        render();
        return;
      }

      state.section = kind as ResourceKind;
      state.selectedKind = state.section;
      state.selectedResourceId = '';
      if (state.section === 'replicasets' || state.section === 'jobs' || state.section === 'cronjobs' || state.section === 'pvs' || state.section === 'storageclasses' || state.section === 'namespaces') {
        void loadResources(state.section);
      } else {
        render();
      }
    });
  });

  document.querySelector<HTMLSelectElement>('#context-select')?.addEventListener('change', async (event) => {
    const target = event.target as HTMLSelectElement;
    const nextContextId = target.value;
    if (!nextContextId || nextContextId === state.selectedContextId) {
      return;
    }

    try {
      if (!window.kubeApi) {
        throw new Error('Preload API is unavailable.');
      }

      const result = await window.kubeApi.setContext(nextContextId);
      state.contexts = result.contexts;
      state.selectedContextId = result.selectedContextId;
      await loadSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown context error.';
      state.error = `Unable to switch cluster context: ${message}`;
      render();
    }
  });

  document.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedResourceId = row.dataset.resourceId || '';
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.sort-button').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const column = button.dataset.sortColumn;
      if (!column) {
        return;
      }

      if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'ascending' ? 'descending' : 'ascending';
      } else {
        state.sortColumn = column;
        state.sortDirection = 'ascending';
      }

      render();
    });
  });

  document.querySelector<HTMLButtonElement>('#close-inspector')?.addEventListener('click', () => {
    state.selectedResourceId = '';
    render();
  });

  document.querySelector<HTMLSelectElement>('#namespace')?.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement;
    state.namespace = target.value;
    state.selectedResourceId = '';
    void loadSnapshot();
  });

  document.querySelector<HTMLInputElement>('#search')?.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    state.query = target.value;
    state.selectedResourceId = '';
    render();
  });

  document.querySelector<HTMLButtonElement>('#refresh')?.addEventListener('click', () => {
    void loadSnapshot();
  });

  document.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    render();
  });

  document.querySelector<HTMLSelectElement>('#density-select')?.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement;
    applyDensity(target.value as Density);
    render();
  });

  document.querySelector<HTMLButtonElement>('#clear-search')?.addEventListener('click', () => {
    state.query = '';
    state.selectedResourceId = '';
    render();
  });

  document.querySelector<HTMLButtonElement>('#copy-name')?.addEventListener('click', () => {
    const resource = dataplane.selectedResource(
      dataplane.getVisibleResources(state.snapshot, state.selectedKind, state.namespace, state.query),
      state.selectedResourceId,
    );
    if (resource) {
      void navigator.clipboard.writeText(resourceName(resource));
    }
  });

  document.querySelector<HTMLButtonElement>('#copy-manifest')?.addEventListener('click', () => {
    const resource = dataplane.selectedResource(
      dataplane.getVisibleResources(state.snapshot, state.selectedKind, state.namespace, state.query),
      state.selectedResourceId,
    );
    if (resource) {
      void navigator.clipboard.writeText(formatManifest(resource));
    }
  });
}

/** Loads available kubeconfig contexts through preload and selects a sensible default. */
async function loadContexts() {
  try {
    if (!window.kubeApi) {
      throw new Error('Preload API is unavailable.');
    }

    const result = await window.kubeApi.getContexts();
    state.contexts = result.contexts;

    if (result.selectedContextId) {
      state.selectedContextId = result.selectedContextId;
    } else if (state.contexts[0]) {
      state.selectedContextId = state.contexts[0].id;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown context error.';
    state.error = `Unable to load kube contexts: ${message}`;
  }
}

/** Fetches the selected namespace snapshot, falling back to demo data on API failure. */
async function loadSnapshot() {
  state.loading = true;
  state.error = '';
  render();

  try {
    if (!window.kubeApi) {
      throw new Error('Preload API is unavailable.');
    }

    const snapshot = await window.kubeApi.getSnapshot(state.namespace, state.selectedContextId);
    if (snapshot.error) {
      state.snapshot = createDemoSnapshot();
      state.error = `Using demo data because kubectl could not load the cluster: ${snapshot.error}`;
    } else {
      state.snapshot = snapshot;
      state.error = '';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cluster error.';
    state.snapshot = createDemoSnapshot();
    state.error = `Using demo data because kubectl could not load the cluster: ${message}`;
  } finally {
    state.loading = false;
    render();
  }
}

/** Loads a resource collection on demand and merges it into the current snapshot. */
async function loadResources(kind: ResourceKind): Promise<void> {
  state.loading = true;
  state.error = '';
  render();

  try {
    if (!window.kubeApi?.getResources) {
      throw new Error('Preload API is unavailable.');
    }

    const resources = await window.kubeApi.getResources(
      kind,
      state.namespace,
      state.selectedContextId,
    );
    state.snapshot.resources[kind] = resources;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown resource error.';
    state.error = `Using demo data because ReplicaSets could not be loaded: ${message}`;
  } finally {
    state.loading = false;
    render();
  }
}

/** Creates a complete deterministic-shaped demo snapshot used when kubectl is unavailable. */
export function createDemoSnapshot(): Snapshot {
  return {
    context: 'kind-prod-east',
    mode: 'demo',
    namespaces: [
      namespace('default', -42),
      namespace('platform', -38),
      namespace('payments', -34),
      namespace('observability', -30),
      namespace('ingress-nginx', -22),
    ],
    resources: {
      nodes: [
        node('ip-10-20-1-14.ec2.internal', 'control-plane', 'v1.30.4', '8', '32768000Ki', -41),
        node('ip-10-20-2-31.ec2.internal', 'worker', 'v1.30.4', '16', '65536000Ki', -39),
        node('ip-10-20-3-82.ec2.internal', 'worker', 'v1.30.4', '16', '65536000Ki', -39),
      ],
      pods: [
        pod('platform', 'api-gateway-6dc9f8949b-9vz2h', 'Running', '2/2', 0, 'ip-10-20-2-31.ec2.internal', -3),
        pod('platform', 'identity-75d54bb7c8-mr7xj', 'Running', '2/2', 1, 'ip-10-20-3-82.ec2.internal', -9),
        pod('payments', 'ledger-worker-587d98bff4-kp4nr', 'Running', '1/1', 0, 'ip-10-20-2-31.ec2.internal', -12),
        pod('payments', 'billing-api-6bc8ff78dc-dp9xq', 'Pending', '0/1', 0, 'ip-10-20-3-82.ec2.internal', -1),
        pod('observability', 'prometheus-server-0', 'Running', '2/2', 0, 'ip-10-20-2-31.ec2.internal', -25),
        pod('ingress-nginx', 'controller-648b8ccf9f-g5m6q', 'Running', '1/1', 0, 'ip-10-20-3-82.ec2.internal', -18),
      ],
      deployments: [
        workload('Deployment', 'platform', 'api-gateway', 3, 3, -18),
        workload('Deployment', 'platform', 'identity', 2, 2, -18),
        workload('Deployment', 'payments', 'billing-api', 2, 1, -13),
        workload('Deployment', 'payments', 'ledger-worker', 1, 1, -13),
      ],
      daemonsets: [
        daemonset('ingress-nginx', 'node-exporter', 3, 3, -22),
        daemonset('observability', 'fluent-bit', 3, 3, -30),
      ],
      statefulsets: [
        workload('StatefulSet', 'observability', 'prometheus-server', 1, 1, -25),
        workload('StatefulSet', 'payments', 'postgres-ledger', 3, 3, -33),
      ],
      replicasets: [
        {
          kind: 'ReplicaSet',
          metadata: {
            name: 'api-gateway-6dc9f8949b',
            namespace: 'platform',
            creationTimestamp: timestamp(-18),
          },
          spec: { replicas: 3 },
          status: { replicas: 3, readyReplicas: 3 },
        },
      ],
      jobs: [
        {
          kind: 'Job',
          metadata: { name: 'nightly-ledger-sync', namespace: 'payments', creationTimestamp: timestamp(-6) },
          spec: { completions: 1 },
          status: { succeeded: 1, startTime: timestamp(-5.5), completionTime: timestamp(-5) },
        },
      ],
      cronjobs: [
        {
          kind: 'CronJob',
          metadata: { name: 'hourly-ledger-cleanup', namespace: 'payments', creationTimestamp: timestamp(-24) },
          spec: { schedule: '0 * * * *', suspend: false },
          status: { active: [], lastScheduleTime: timestamp(-1) },
        },
      ],
      pvs: [
        {
          kind: 'PersistentVolume',
          metadata: { name: 'payments-ledger-pv', creationTimestamp: timestamp(-36) },
          spec: { storageClassName: 'gp3', capacity: { storage: '200Gi' }, claimRef: { namespace: 'payments', name: 'postgres-ledger-data-0' } },
          status: { phase: 'Bound' },
        },
      ],
      storageclasses: [
        {
          kind: 'StorageClass',
          metadata: { name: 'gp3', creationTimestamp: timestamp(-120) },
          provisioner: 'ebs.csi.aws.com',
          spec: {
            reclaimPolicy: 'Delete',
            volumeBindingMode: 'WaitForFirstConsumer',
            allowVolumeExpansion: true,
          },
        },
      ],
      services: [
        service('platform', 'api-gateway', 'LoadBalancer', '10.96.22.91', '443:32443/TCP', -18),
        service('platform', 'identity', 'ClusterIP', '10.96.32.42', '8080/TCP', -18),
        service('payments', 'billing-api', 'ClusterIP', '10.96.55.7', '8080/TCP', -13),
        service('observability', 'prometheus', 'ClusterIP', '10.96.82.12', '9090/TCP', -25),
      ],
      ingresses: [
        ingress('platform', 'gateway-public', 'nginx', ['api.example.local'], -17),
        ingress('observability', 'prometheus-internal', 'nginx', ['prometheus.example.local'], -24),
      ],
      configmaps: [
        configMap('platform', 'api-gateway-config', ['routes.yaml', 'limits.yaml'], -18),
        configMap('payments', 'billing-feature-flags', ['features.json'], -12),
        configMap('observability', 'prometheus-rules', ['alerts.yaml', 'recording.yaml'], -24),
      ],
      secrets: [
        secret('platform', 'identity-oidc-client', 'Opaque', ['client-id', 'client-secret'], -18),
        secret('payments', 'ledger-postgres', 'kubernetes.io/basic-auth', ['username', 'password'], -33),
        secret('ingress-nginx', 'wildcard-tls', 'kubernetes.io/tls', ['tls.crt', 'tls.key'], -22),
      ],
      pvcs: [
        pvc('payments', 'postgres-ledger-data-0', 'Bound', '200Gi', 'gp3', -33),
        pvc('payments', 'postgres-ledger-data-1', 'Bound', '200Gi', 'gp3', -33),
        pvc('observability', 'prometheus-server-data-0', 'Bound', '500Gi', 'gp3', -25),
      ],
      events: [
        event('payments', 'billing-api-6bc8ff78dc-dp9xq', 'Warning', 'FailedScheduling', '0/3 nodes available: insufficient cpu.', 6, -1),
        event('platform', 'identity-75d54bb7c8-mr7xj', 'Normal', 'Pulled', 'Container image pulled successfully.', 4, -2),
        event('observability', 'prometheus-server-0', 'Normal', 'SuccessfulAttachVolume', 'AttachVolume.Attach succeeded for volume prometheus-data.', 1, -22),
      ],
    },
  };
}

/** Produces an ISO timestamp relative to now for realistic fixture ages. */
export function timestamp(hoursOffset: number): string {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

/** Creates a namespace fixture with standard Kubernetes metadata and an Active phase. */
export function namespace(name: string, hoursOffset: number): KubeResource {
  return {
    kind: 'Namespace',
    metadata: {
      name,
      creationTimestamp: timestamp(hoursOffset),
      labels: { 'kubernetes.io/metadata.name': name },
    },
    status: { phase: 'Active' },
  };
}

/** Creates a node fixture with role labels, capacity, version, and a Ready condition. */
export function node(
  name: string,
  role: string,
  version: string,
  cpu: string,
  memory: string,
  hoursOffset: number,
): KubeResource {
  return {
    kind: 'Node',
    metadata: {
      name,
      creationTimestamp: timestamp(hoursOffset),
      labels: {
        [`node-role.kubernetes.io/${role}`]: '',
        'topology.kubernetes.io/zone': name.includes('1-14') ? 'us-east-1a' : 'us-east-1b',
      },
    },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      capacity: { cpu, memory, pods: '110' },
      nodeInfo: { kubeletVersion: version, containerRuntimeVersion: 'containerd://1.7.22' },
    },
  };
}

/** Creates a pod fixture with container readiness, restart counts, and node placement. */
export function pod(
  namespaceName: string,
  name: string,
  phase: string,
  ready: string,
  restarts: number,
  nodeName: string,
  hoursOffset: number,
): KubeResource {
  const [readyCount, totalCount] = ready.split('/').map(Number);

  return {
    kind: 'Pod',
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: {
        app: name.split('-')[0],
        'app.kubernetes.io/managed-by': 'kube-cluster-ui',
      },
    },
    spec: { nodeName, restartPolicy: 'Always' },
    status: {
      phase,
      podIP: `10.244.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 200)}`,
      containerStatuses: Array.from({ length: totalCount }, (_item, index) => ({
        name: `container-${index + 1}`,
        ready: index < readyCount,
        restartCount: index === 0 ? restarts : 0,
      })),
    },
  };
}

/** Creates a Deployment or StatefulSet fixture with replica and availability counters. */
export function workload(
  kind: 'Deployment' | 'StatefulSet',
  namespaceName: string,
  name: string,
  replicas: number,
  readyReplicas: number,
  hoursOffset: number,
): KubeResource {
  return {
    kind,
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: { app: name, tier: namespaceName },
    },
    spec: { replicas },
    status: {
      replicas,
      readyReplicas,
      updatedReplicas: readyReplicas,
      availableReplicas: readyReplicas,
    },
  };
}

/** Creates a DaemonSet fixture using scheduled and available node counts. */
export function daemonset(
  namespaceName: string,
  name: string,
  desired: number,
  available: number,
  hoursOffset: number,
): KubeResource {
  return {
    kind: 'DaemonSet',
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: { app: name },
    },
    status: {
      desiredNumberScheduled: desired,
      currentNumberScheduled: desired,
      numberAvailable: available,
      readyReplicas: available,
      replicas: desired,
    },
  };
}

/** Creates a Service fixture from a compact port specification such as 443:32443/TCP. */
export function service(
  namespaceName: string,
  name: string,
  type: string,
  clusterIP: string,
  portSpec: string,
  hoursOffset: number,
): KubeResource {
  const [port, protocol = 'TCP'] = portSpec.split('/');
  const [servicePort, nodePort] = port.split(':').map(Number);

  return {
    kind: 'Service',
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: { app: name },
    },
    spec: {
      type,
      clusterIP,
      ports: [{ port: servicePort, nodePort, protocol }],
    },
  };
}

/** Creates an Ingress fixture with its class name and host rules. */
export function ingress(
  namespaceName: string,
  name: string,
  ingressClassName: string,
  hosts: string[],
  hoursOffset: number,
): KubeResource {
  return {
    kind: 'Ingress',
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: { exposure: 'internal' },
    },
    spec: {
      ingressClassName,
      rules: hosts.map((host) => ({ host })),
    },
  };
}

/** Creates a ConfigMap fixture whose keys contain placeholder managed configuration. */
export function configMap(
  namespaceName: string,
  name: string,
  keys: string[],
  hoursOffset: number,
): KubeResource {
  return {
    kind: 'ConfigMap',
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: { app: name.replace('-config', '') },
    },
    data: keys.reduce<Record<string, string>>((acc, key) => {
      acc[key] = '# managed configuration';
      return acc;
    }, {}),
  };
}

/** Creates a Secret fixture with redacted placeholder values for the requested keys. */
export function secret(
  namespaceName: string,
  name: string,
  type: string,
  keys: string[],
  hoursOffset: number,
): KubeResource {
  return {
    kind: 'Secret',
    type,
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: { app: name.split('-')[0] },
    },
    data: keys.reduce<Record<string, string>>((acc, key) => {
      acc[key] = 'REDACTED';
      return acc;
    }, {}),
  };
}

/** Creates a persistent volume claim fixture with storage class and capacity information. */
export function pvc(
  namespaceName: string,
  name: string,
  phase: string,
  storage: string,
  storageClassName: string,
  hoursOffset: number,
): KubeResource {
  return {
    kind: 'PersistentVolumeClaim',
    metadata: {
      name,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset),
      labels: { storage: 'data' },
    },
    spec: { storageClassName },
    status: { phase, capacity: { storage } },
  };
}

/** Creates an Event fixture tied to a named involved object and recent timestamp. */
export function event(
  namespaceName: string,
  objectName: string,
  type: string,
  reason: string,
  message: string,
  count: number,
  hoursOffset: number,
): KubeResource {
  return {
    kind: 'Event',
    type,
    reason,
    message,
    count,
    lastTimestamp: timestamp(hoursOffset),
    metadata: {
      name: `${objectName}.${Math.abs(hoursOffset)}h`,
      namespace: namespaceName,
      creationTimestamp: timestamp(hoursOffset - 1),
      labels: { source: 'scheduler' },
    },
    involvedObject: {
      kind: 'Pod',
      name: objectName,
      namespace: namespaceName,
    },
  };
}

void (async () => {
  applyTheme(state.theme);
  applyDensity(state.density);
  window.appInfo?.onShowAbout(() => {
    void openAbout();
  });
  await loadContexts();
  await loadSnapshot();
})();
