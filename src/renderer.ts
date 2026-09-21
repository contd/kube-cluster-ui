import { createIcons, icons } from 'lucide';
import YAML from 'yaml';
// CSS is bundled by the build tool; TypeScript has no declaration for this side-effect import.
// @ts-expect-error -- the bundler resolves the stylesheet at build time.
import './index.css';

type ResourceKind =
  | 'nodes'
  | 'pods'
  | 'deployments'
  | 'daemonsets'
  | 'statefulsets'
  | 'services'
  | 'ingresses'
  | 'configmaps'
  | 'secrets'
  | 'pvcs'
  | 'events';

type StatusTone = 'healthy' | 'warning' | 'danger' | 'neutral';
type Theme = 'light' | 'dark';
type Density = 'normal' | 'compact';

type Metadata = {
  name?: string;
  namespace?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
};

type KubeResource = {
  kind?: string;
  type?: string;
  metadata?: Metadata;
  status?: Record<string, unknown>;
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  involvedObject?: {
    kind?: string;
    name?: string;
    namespace?: string;
  };
  reason?: string;
  message?: string;
  count?: number;
  lastTimestamp?: string;
};

type Snapshot = {
  context: string;
  mode: 'live' | 'demo';
  error?: string;
  namespaces: KubeResource[];
  resources: Record<ResourceKind, KubeResource[]>;
};

type ClusterContext = {
  id: string;
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  filePath: string;
  fileName: string;
  isCurrent: boolean;
};

type KubeApi = {
  getContexts: () => Promise<{
    defaultPath: string;
    contexts: ClusterContext[];
    selectedContextId: string;
  }>;
  setContext: (contextId: string) => Promise<{
    defaultPath: string;
    contexts: ClusterContext[];
    selectedContextId: string;
  }>;
  getSnapshot: (namespace: string, contextId?: string) => Promise<Snapshot>;
  getResource: (
    kind: ResourceKind,
    namespace: string,
    name: string,
    contextId?: string,
  ) => Promise<KubeResource>;
};

declare global {
  interface Window {
    kubeApi?: KubeApi;
  }
}

type NavItem = {
  kind: ResourceKind;
  label: string;
  group: string;
  icon: string;
};

type Column = {
  label: string;
  value: (resource: KubeResource) => string;
};

type SortDirection = 'ascending' | 'descending';

const navItems: NavItem[] = [
  { kind: 'nodes', label: 'Nodes', group: 'Cluster', icon: 'server' },
  { kind: 'pods', label: 'Pods', group: 'Workloads', icon: 'box' },
  {
    kind: 'deployments',
    label: 'Deployments',
    group: 'Workloads',
    icon: 'boxes',
  },
  {
    kind: 'daemonsets',
    label: 'DaemonSets',
    group: 'Workloads',
    icon: 'refresh-cw',
  },
  {
    kind: 'statefulsets',
    label: 'StatefulSets',
    group: 'Workloads',
    icon: 'database',
  },
  { kind: 'services', label: 'Services', group: 'Network', icon: 'route' },
  { kind: 'ingresses', label: 'Ingresses', group: 'Network', icon: 'globe-2' },
  {
    kind: 'configmaps',
    label: 'ConfigMaps',
    group: 'Configuration',
    icon: 'file-cog',
  },
  { kind: 'secrets', label: 'Secrets', group: 'Configuration', icon: 'key' },
  { kind: 'pvcs', label: 'PVCs', group: 'Storage', icon: 'hard-drive' },
  { kind: 'events', label: 'Events', group: 'Observability', icon: 'bell' },
];

const namespacedKinds = new Set<ResourceKind>([
  'pods',
  'deployments',
  'daemonsets',
  'statefulsets',
  'services',
  'ingresses',
  'configmaps',
  'secrets',
  'pvcs',
  'events',
]);

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
  density: (localStorage.getItem('kube-cluster-ui-density') === 'compact' ? 'compact' : 'normal') as Density,
  sortColumn: 'Name',
  sortDirection: 'ascending' as SortDirection,
};

function applyTheme(theme: Theme): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('kube-cluster-ui-theme', theme);
}

function applyDensity(density: Density): void {
  state.density = density;
  document.documentElement.dataset.density = density;
  localStorage.setItem('kube-cluster-ui-density', density);
}

function objectValue(
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

function stringValue(value: unknown, fallback = '-'): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
}

function metadata(resource: KubeResource): Metadata {
  return resource.metadata || {};
}

function resourceName(resource: KubeResource): string {
  if (resource.kind === 'Event') {
    return resource.involvedObject?.name || metadata(resource).name || '-';
  }

  return metadata(resource).name || '-';
}

function resourceNamespace(resource: KubeResource): string {
  return (
    metadata(resource).namespace ||
    resource.involvedObject?.namespace ||
    (resource.kind === 'Node' ? 'cluster' : 'default')
  );
}

function resourceId(resource: KubeResource): string {
  return `${resourceNamespace(resource)}:${metadata(resource).name || resourceName(resource)}`;
}

function age(isoDate?: string): string {
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

function podReady(resource: KubeResource): string {
  const statuses = objectValue(resource.status, ['containerStatuses']);
  if (!Array.isArray(statuses)) {
    return '-';
  }

  const ready = statuses.filter((status) => {
    return Boolean((status as Record<string, unknown>).ready);
  }).length;

  return `${ready}/${statuses.length}`;
}

function workloadReady(resource: KubeResource): string {
  const ready = stringValue(objectValue(resource.status, ['readyReplicas']), '0');
  const desired = stringValue(
    objectValue(resource.status, ['replicas']) ||
      objectValue(resource.spec, ['replicas']),
    '0',
  );

  return `${ready}/${desired}`;
}

function nodePressure(resource: KubeResource): string {
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

function statusFor(resource: KubeResource, kind: ResourceKind): string {
  if (kind === 'pods') {
    return stringValue(objectValue(resource.status, ['phase']));
  }

  if (kind === 'nodes') {
    return nodePressure(resource);
  }

  if (kind === 'events') {
    return resource.type || 'Normal';
  }

  if (kind === 'pvcs') {
    return stringValue(objectValue(resource.status, ['phase']));
  }

  if (kind === 'secrets') {
    return stringValue(resource.type);
  }

  if (['deployments', 'daemonsets', 'statefulsets'].includes(kind)) {
    return workloadReady(resource);
  }

  return stringValue(objectValue(resource.spec, ['type']));
}

function statusTone(resource: KubeResource, kind: ResourceKind): StatusTone {
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

function columnsFor(kind: ResourceKind): Column[] {
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
          stringValue(objectValue(resource.status, ['capacity', 'memory'])),
      },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'pods') {
    return [
      ...common,
      { label: 'Ready', value: podReady },
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
    ];
  }

  if (['deployments', 'daemonsets', 'statefulsets'].includes(kind)) {
    return [
      ...common,
      { label: 'Ready', value: (resource) => statusFor(resource, kind) },
      {
        label: 'Up To Date',
        value: (resource) =>
          stringValue(
            objectValue(resource.status, ['updatedReplicas']) ||
              objectValue(resource.status, ['currentNumberScheduled']),
            '0',
          ),
      },
      {
        label: 'Available',
        value: (resource) =>
          stringValue(
            objectValue(resource.status, ['availableReplicas']) ||
              objectValue(resource.status, ['numberAvailable']),
            '0',
          ),
      },
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

function escapeHtml(value: string): string {
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

function formatManifest(resource: KubeResource): string {
  const manifest = {
    ...resource,
    metadata: { ...metadata(resource) },
  } as KubeResource & {
    metadata: Record<string, unknown>;
  };

  delete manifest.metadata.managedFields;

  return YAML.stringify(manifest);
}

function highlightYaml(yaml: string): string {
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

function getResources(kind = state.selectedKind): KubeResource[] {
  return state.snapshot.resources[kind] || [];
}

function getVisibleResources(): KubeResource[] {
  const query = state.query.trim().toLowerCase();

  return getResources().filter((resource) => {
    const namespaceMatches =
      state.namespace === 'all' ||
      !namespacedKinds.has(state.selectedKind) ||
      resourceNamespace(resource) === state.namespace;

    if (!namespaceMatches) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = [
      resourceName(resource),
      metadata(resource).name,
      resourceNamespace(resource),
      statusFor(resource, state.selectedKind),
      resource.reason,
      resource.message,
      JSON.stringify(metadata(resource).labels || {}),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchable.includes(query);
  });
}

function selectedResource(): KubeResource | undefined {
  return getVisibleResources().find((resource) => {
    return resourceId(resource) === state.selectedResourceId;
  });
}

function namespaceOptions(): string[] {
  const namespaces = state.snapshot.namespaces
    .map((namespace) => metadata(namespace).name)
    .filter((namespace): namespace is string => Boolean(namespace));

  return ['all', ...Array.from(new Set(namespaces)).sort()];
}

function contextLabel(context: ClusterContext): string {
  return context.name || context.fileName || 'Unknown context';
}

function healthSummary() {
  const pods = getResources('pods');
  const nodes = getResources('nodes');
  const events = getResources('events');
  const workloads = [
    ...getResources('deployments'),
    ...getResources('daemonsets'),
    ...getResources('statefulsets'),
  ];
  const runningPods = pods.filter((pod) => statusFor(pod, 'pods') === 'Running').length;
  const readyNodes = nodes.filter((node) => statusFor(node, 'nodes') === 'Ready').length;
  const warnings = events.filter((event) => event.type === 'Warning').length;
  const readyWorkloads = workloads.filter((resource) => {
    const ready = statusFor(resource, 'deployments').split('/');
    return ready[0] === ready[1];
  }).length;

  return {
    pods,
    nodes,
    events,
    workloads,
    runningPods,
    readyNodes,
    warnings,
    readyWorkloads,
  };
}

function render() {
  if (!app) {
    return;
  }

  const currentNav = navItems.find((item) => item.kind === state.selectedKind);
  const resources = getVisibleResources();
  const selected = selectedResource();

  const groupedNav = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }

    acc[item.group].push(item);
    return acc;
  }, {});

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">
            <i data-lucide="network"></i>
          </div>
          <div>
            <div class="brand-title">Kube Cluster UI</div>
            <div class="brand-subtitle">${escapeHtml(state.snapshot.context)}</div>
          </div>
        </div>

        <div class="connection ${state.loading ? 'loading' : state.snapshot.mode}">
          <span></span>
          ${
            state.loading
              ? 'Loading cluster data'
              : state.snapshot.mode === 'live'
                ? 'Connected via kubectl'
                : 'Demo data'
          }
        </div>

        <div class="context-picker">
          <label class="context-control">
            <span>Server</span>
            <select id="context-select">
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

        <nav class="navigation">
          ${Object.entries(groupedNav)
            .map(([group, items]) => {
              return `
                <section class="nav-group">
                  <h2>${escapeHtml(group)}</h2>
                  ${items
                    .map((item) => {
                      const count = getResources(item.kind).length;
                      const active = item.kind === state.selectedKind ? 'active' : '';

                      return `
                        <button class="nav-item ${active}" data-kind="${item.kind}">
                          <span class="nav-label">
                            <i data-lucide="${item.icon}"></i>
                            ${escapeHtml(item.label)}
                          </span>
                          <span class="nav-count">${count}</span>
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
            <label class="control">
              <span>Namespace</span>
              <select id="namespace">
                ${namespaceOptions()
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

            <button class="icon-button" id="density-toggle" title="Switch to ${state.density === 'compact' ? 'normal' : 'compact'} mode" aria-label="Switch to ${state.density === 'compact' ? 'normal' : 'compact'} mode">
              <i data-lucide="${state.density === 'compact' ? 'maximize-2' : 'minimize-2'}"></i>
            </button>
          </div>
        </header>

        ${state.error ? `<div class="banner"><i data-lucide="info"></i>${escapeHtml(state.error)}</div>` : ''}

        ${renderSummary()}

        <section class="content">
          <section class="resource-panel">
            <div class="panel-header">
              <div>
                <h2>${escapeHtml(currentNav?.label || 'Resources')}</h2>
                <p>${resources.length} shown of ${getResources().length}</p>
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
        </section>
      </main>
    </div>
  `;

  createIcons({ icons });
  bindEvents();
}

function renderSummary(): string {
  const summary = healthSummary();
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

            return `
              <tr class="${active}" data-resource-id="${escapeHtml(resourceId(resource))}">
                <td>
                  <div class="name-cell">
                    <span class="status-dot ${tone}"></span>
                    <div>
                      <strong>${escapeHtml(resourceName(resource))}</strong>
                      <span>${escapeHtml(metadata(resource).name || resourceName(resource))}</span>
                    </div>
                  </div>
                </td>
                ${columns
                  .map((column) => {
                    const value = column.label === 'Status' || column.label === 'Type'
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

function renderEventMessage(resource: KubeResource): string {
  return `
    <section class="detail-section">
      <h3>Message</h3>
      <p class="event-message">${escapeHtml(resource.message || 'No event message available.')}</p>
    </section>
  `;
}

function fact(label: string, value: string): string {
  return `
    <div class="fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function kindLabel(kind: ResourceKind): string {
  return navItems.find((item) => item.kind === kind)?.label || kind;
}

function bindEvents() {
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedKind = button.dataset.kind as ResourceKind;
      state.selectedResourceId = '';
      render();
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

  document.querySelector<HTMLButtonElement>('#density-toggle')?.addEventListener('click', () => {
    applyDensity(state.density === 'compact' ? 'normal' : 'compact');
    render();
  });

  document.querySelector<HTMLButtonElement>('#clear-search')?.addEventListener('click', () => {
    state.query = '';
    state.selectedResourceId = '';
    render();
  });

  document.querySelector<HTMLButtonElement>('#copy-name')?.addEventListener('click', () => {
    const resource = selectedResource();
    if (resource) {
      void navigator.clipboard.writeText(resourceName(resource));
    }
  });

  document.querySelector<HTMLButtonElement>('#copy-manifest')?.addEventListener('click', () => {
    const resource = selectedResource();
    if (resource) {
      void navigator.clipboard.writeText(formatManifest(resource));
    }
  });
}

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

function createDemoSnapshot(): Snapshot {
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

function timestamp(hoursOffset: number): string {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

function namespace(name: string, hoursOffset: number): KubeResource {
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

function node(
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

function pod(
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

function workload(
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

function daemonset(
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

function service(
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

function ingress(
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

function configMap(
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

function secret(
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

function pvc(
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

function event(
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
  await loadContexts();
  await loadSnapshot();
})();
