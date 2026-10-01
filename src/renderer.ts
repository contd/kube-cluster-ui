/** Renderer entry point for Kubernetes views, resource helpers, and dashboard interactions. */
import { createIcons, icons } from 'lucide';
import YAML from 'yaml';
import * as dataplane from './dataplane';
import './components/brand-mark';
import './components/terminal-panel';
import {
  bindAboutPageEvents,
  openAboutPage,
  renderAboutPage,
} from './components/aboutpage';
import {
  bindSettingsPageEvents,
  openSettingsPage,
  renderSettingsPage,
} from './components/settingspage';
import type {
  AboutInfo,
  CliToolsAvailability,
  ClusterContext,
  Column,
  Density,
  KubectlResult,
  KubeResource,
  Metadata,
  NavItem,
  ResourceKind,
  Snapshot,
  SavedKubeconfig,
  SortDirection,
  StatusTone,
  Theme,
} from './app.types';
export type {
  AboutInfo,
  CliToolsAvailability,
  ClusterContext,
  Column,
  Density,
  KubectlResult,
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
// CSS is bundled by Vite; Pylance does not resolve this side-effect import.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the bundler resolves the stylesheet at build time.
import './index.css';

const navItems = dataplane.navItems;

const app = document.querySelector<HTMLDivElement>('#app');

const state = {
  selectedKind: 'pods' as ResourceKind,
  selectedResourceId: '',
  collapsedNavGroups: { Configuration: true, Storage: true, Observability: true, 'Access Control': true } as Record<string, boolean>,
  kubectlInput: '',
  kubectlHistory: [] as string[],
  kubectlResult: null as (KubectlResult & {
    /** Command text associated with the displayed result. */
    command: string;
  }) | null,
  kubectlError: '',
  kubectlRunning: false,
  kubectlRequestId: 0,
  cliToolsAvailability: null as CliToolsAvailability | null,
  kubectlAvailabilityMessage: 'Checking whether kubectl is available...',
  outputExpanded: false,
  namespace: 'all',
  query: '',
  selectedContextId: '',
  contexts: [] as ClusterContext[],
  snapshot: createDemoSnapshot(),
  loading: true,
  error: '',
  theme: (localStorage.getItem('orbita-theme') === 'dark' ? 'dark' : 'light') as Theme,
  density: ((localStorage.getItem('orbita-density') as Density | null) || 'cozy') as Density,
  kubeconfigDialog: false,
  kubeconfigError: '',
  sortColumn: 'Name',
  sortDirection: 'ascending' as SortDirection,
  section: 'dashboard' as 'dashboard' | ResourceKind,
  view: 'dashboard' as 'dashboard' | 'about' | 'settings',
  about: null as AboutInfo | null,
  kubeconfigSearchPath: '',
  settingsLoading: false,
  settingsSaving: false,
  settingsSaved: false,
  settingsError: '',
  terminalPanelOpen: false,
  savedKubeconfigs: [] as SavedKubeconfig[],
  kubeconfigDrafts: {} as Record<string, string>,
};

/**
 * Applies the selected theme to the document and persists it for the next launch.
 * @param theme - Theme mode to apply and save.
 */
function applyTheme(theme: Theme): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('orbita-theme', theme);
}

/**
 * Applies the density mode to the document and persists the user's display preference.
 * @param density - Density preset to apply and save.
 */
function applyDensity(density: Density): void {
  state.density = density;
  document.documentElement.dataset.density = density;
  localStorage.setItem('orbita-density', density);
}

/**
 * Clears terminal output and prevents any in-flight command from restoring stale results.
 * @returns Nothing; invalidates pending command responses and clears result state.
 */
function clearKubectlOutput(): void {
  state.kubectlRequestId += 1;
  state.kubectlResult = null;
  state.kubectlError = '';
  state.kubectlRunning = false;
}

/**
 * Scrolls the command log to the newest entry after a submitted command renders.
 * @returns Nothing; updates the terminal history scroll position when present.
 */
function scrollKubectlHistoryToBottom(): void {
  const history = document.querySelector<HTMLElement>('.kubectl-terminal-screen');
  if (history) {
    history.scrollTop = history.scrollHeight;
  }
}

/**
 * Walks a nested Kubernetes object safely and returns the value at the requested path.
 * @param value - Root object to inspect.
 * @param path - Ordered property names leading to the value.
 * @returns Nested value, or `undefined` when a segment is unavailable.
 */
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

/**
 * Converts API values into display text while normalizing missing and array values.
 * @param value - API value to convert.
 * @param fallback - Text used for nullish or empty input.
 * @returns A display-safe string.
 */
export function stringValue(value: unknown, fallback = '-'): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
}

/**
 * Returns resource metadata or an empty object so callers can render incomplete API data safely.
 * @param resource - Kubernetes resource to inspect.
 * @returns Resource metadata, or an empty object when metadata is absent.
 */
export function metadata(resource: KubeResource): Metadata {
  return resource.metadata || {};
}

/**
 * Resolves the human-readable name, preferring an Event's involved object when available.
 * @param resource - Kubernetes resource to name.
 * @returns The resource name or `-` when no name is available.
 */
export function resourceName(resource: KubeResource): string {
  if (resource.kind === 'Event') {
    return resource.involvedObject?.name || metadata(resource).name || '-';
  }

  return metadata(resource).name || '-';
}

/**
 * Resolves a resource namespace and supplies cluster/default fallbacks for unscoped resources.
 * @param resource - Kubernetes resource whose namespace is requested.
 * @returns Namespace, `cluster` for Nodes, or `default` as a fallback.
 */
export function resourceNamespace(resource: KubeResource): string {
  return (
    metadata(resource).namespace ||
    resource.involvedObject?.namespace ||
    (resource.kind === 'Node' ? 'cluster' : 'default')
  );
}

/**
 * Builds the stable namespace/name key used to select a resource in the inspector.
 * @param resource - Kubernetes resource to identify.
 * @returns Stable `namespace:name` identity.
 */
export function resourceId(resource: KubeResource): string {
  return `${resourceNamespace(resource)}:${metadata(resource).name || resourceName(resource)}`;
}

/**
 * Formats an ISO timestamp as a compact elapsed time suitable for table cells.
 * @param isoDate - Timestamp to measure from, when present.
 * @returns Elapsed time in minutes, hours, or days, or `-` when absent.
 */
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

/**
 * Counts ready pod containers and formats the result as ready/total.
 * @param resource - Pod resource whose container statuses are counted.
 * @returns Ready/total count, or `-` when statuses are unavailable.
 */
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

/**
 * Reads workload replica counts from status/spec and formats them as ready/desired.
 * @param resource - Workload resource whose replica counts are read.
 * @returns Ready and desired replicas in `ready/desired` form.
 */
export function workloadReady(resource: KubeResource): string {
  const ready = stringValue(objectValue(resource.status, ['readyReplicas']), '0');
  const desired = stringValue(
    objectValue(resource.status, ['replicas']) ||
      objectValue(resource.spec, ['replicas']),
    '0',
  );

  return `${ready}/${desired}`;
}

/**
 * Interprets a node's Ready condition as the status text shown in the UI.
 * @param resource - Node resource whose conditions are inspected.
 * @returns `Ready`, `NotReady`, or `Unknown` when conditions are unavailable.
 */
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

/**
 * Selects the status field appropriate to each Kubernetes resource category.
 * @param resource - Kubernetes resource whose status is displayed.
 * @param kind - Resource kind selecting the status interpretation.
 * @returns Normalized status text for the requested resource kind.
 */
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

/**
 * Maps a resource status to the semantic color tone used by badges and status dots.
 * @param resource - Kubernetes resource whose status is classified.
 * @param kind - Resource kind selecting the status interpretation.
 * @returns Semantic status tone for the resource.
 */
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

/**
 * Defines the table columns and value readers for a resource category.
 * @param kind - Resource kind whose table schema is requested.
 * @returns Ordered column definitions for the resource table.
 */
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

  if (kind === 'serviceaccounts') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Secrets', value: (resource) => String(resource.secrets?.length || 0) },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'clusterroles' || kind === 'roles') {
    return [
      ...(kind === 'roles' ? [{ label: 'Namespace', value: resourceNamespace }] : []),
      { label: 'Rules', value: (resource) => String(resource.rules?.length || 0) },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'clusterrolebindings' || kind === 'rolebindings') {
    return [
      ...(kind === 'rolebindings' ? [{ label: 'Namespace', value: resourceNamespace }] : []),
      { label: 'Subjects', value: (resource) => String(resource.subjects?.length || 0) },
      { label: 'Role', value: (resource) => resource.roleRef?.name || '-' },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
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

/**
 * Escapes untrusted Kubernetes values before inserting them into HTML strings.
 * @param value - Untrusted text to escape.
 * @returns HTML-safe text.
 */
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

/**
 * Builds a sanitized YAML manifest, omitting server-managed metadata before display/copy.
 * @param resource - Kubernetes resource to serialize.
 * @returns YAML with server-managed `metadata.managedFields` removed.
 */
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
    /** Resource metadata copied into the sanitized manifest. */
    metadata: Record<string, unknown>;
  };

  delete manifest.metadata.managedFields;

  return YAML.stringify(manifest);
}

/**
 * Adds lightweight syntax classes to escaped YAML for the manifest preview.
 * @param yaml - YAML source text to highlight.
 * @returns Escaped HTML markup with YAML syntax classes.
 */
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

/**
 * Highlights JSON, Kubernetes YAML, table headers, and common status values.
 * @param output - Raw stdout/stderr text from a kubectl invocation.
 * @returns Escaped and syntax-highlighted HTML for the output pane.
 */
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

/**
 * Rebuilds the active dashboard or custom view and reconnects its DOM event handlers.
 * @returns Nothing; replaces the application root with the active view markup.
 */
function render() {
  if (!app) {
    return;
  }

  if (state.view === 'about') {
    app.innerHTML = renderAboutPage(state.about);
    createIcons({ icons });
    bindAboutPageEvents(app, () => {
      state.view = 'dashboard';
      render();
    });
    return;
  }

  if (state.view === 'settings') {
    app.innerHTML = renderSettingsPage(state);
    createIcons({ icons });
    bindSettingsPageEvents(app, state, settingsPageActions());
    return;
  }

  const currentNav = navItems.find((item) => item.kind === (state.section === 'dashboard' ? 'dashboard' : state.selectedKind));
  const resources = dataplane.getVisibleResources(state.snapshot, state.selectedKind, state.namespace, state.query);
  const selected = dataplane.selectedResource(resources, state.selectedResourceId);
  const clusterStatus = state.loading
    ? `Connecting to ${state.snapshot.context}`
    : state.snapshot.mode === 'live'
      ? `Connected to ${state.snapshot.context}`
      : state.snapshot.context === 'No Kubernetes context'
        ? 'No cluster connected'
        : `Cluster: ${state.snapshot.context}`;
  const cliTools = (['kubectl', 'docker', 'kind'] as const).map((tool) => {
    const availability = state.cliToolsAvailability?.[tool];
    const tooltip = !availability
      ? 'Checking availability'
      : availability.available
        ? 'Detected'
        : 'Not detected';
    const accessibleLabel = !availability
      ? `Checking ${tool} availability`
      : availability.available
        ? `${tool} detected`
        : `${tool} not detected`;
    const tone = !availability
      ? 'checking'
      : availability.available
        ? 'available'
        : 'unavailable';

    return `<div class="cli-detection ${tool}-detection ${tone}" data-tooltip="${tooltip}" aria-label="${escapeHtml(accessibleLabel)}" tabindex="0"><span class="cli-detection-indicator"></span><span>${tool}</span></div>`;
  });

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
            <brand-mark
              blue-bg-fill="rgb(62, 123, 250)" blue-bg-opacity="0.99"
              dark-bg-fill="rgb(6, 13, 45)" dark-bg-opacity="0.99"
              cube-top-fill="rgb(59, 177, 251)" cube-top-opacity="0.98"
              cube-left-fill="rgb(55, 132, 250)" cube-left-opacity="0.98"
              cube-right-fill="rgb(75, 90, 250)" cube-right-opacity="0.99"
              bottom-fill="rgb(52, 133, 250)" bottom-opacity="0.98"
              bottom-left-fill="rgb(55, 139, 250)" bottom-left-opacity="0.98"
              bottom-right-fill="rgb(55, 138, 250)" bottom-right-opacity="0.98"
              top-right-fill="rgb(55, 143, 250)" top-right-opacity="0.98"
              top-left-fill="rgb(55, 145, 250)" top-left-opacity="0.98"
              top-center-fill="rgb(54, 153, 250)" top-center-opacity="0.98"
            ></brand-mark>
          </div>
          <div>
            <div class="brand-title">Orbita</div>
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
              const collapsed = state.collapsedNavGroups[group] || false;
              const contentId = `nav-group-content-${group.toLowerCase()}`;

              return `
                <section class="nav-group">
                  <div class="nav-group-heading">
                    <h2>
                      <button class="nav-group-toggle" data-group="${escapeHtml(group)}" aria-expanded="${!collapsed}" aria-controls="${contentId}">
                        <span>${escapeHtml(group)}</span>
                        <i data-lucide="chevron-down" aria-hidden="true"></i>
                      </button>
                    </h2>
                    ${group === 'Cluster' ? `
                      <button class="context-add" id="add-context" title="Add kubeconfig" aria-label="Add kubeconfig">
                        <i data-lucide="plus"></i>
                      </button>
                    ` : ''}
                  </div>
                  <div class="nav-group-content" id="${contentId}" ${collapsed ? 'hidden' : ''}>
                    ${group === 'Cluster' ? contextPicker : ''}
                    ${items
                      .map((item) => {
                        const count = item.kind === 'dashboard'
                          ? 0
                          : dataplane.getResources(state.snapshot, item.kind).length;
                        const active = item.kind === state.section ? 'active' : '';

                        return `
                          <button class="nav-item ${active}" data-kind="${item.kind}">
                            <span class="nav-label">
                              <i data-lucide="${item.icon}"></i>
                              ${escapeHtml(item.label)}
                            </span>
                            ${count > 0 ? `<span class="nav-count">${count}</span>` : ''}
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
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
            <button class="icon-button terminal-launcher" id="open-terminal-panel" title="Kubectl terminal" aria-label="Open kubectl terminal">
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M0 0h16v16H0z" fill="none" />
                <path fill="currentColor" d="M1 1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1m6.5 11a.5.5 0 1 1 0-1h5a.5.5 0 1 1 0 1zM3.146 5.354a.5.5 0 1 1 .708-.708L6.457 7.25a1 1 0 0 1 .003 1.397l-2.6 2.7a.5.5 0 1 1-.72-.694L5.743 7.95zM1 2v12h14V2z" />
              </svg>
            </button>
            <button class="icon-button" id="open-settings" title="Settings" aria-label="Settings">
              <i data-lucide="settings-2"></i>
            </button>

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
        <terminal-panel theme="${state.theme}" ${state.terminalPanelOpen ? 'open' : ''}>
          ${renderKubectlTerminal()}
        </terminal-panel>
        <div class="cluster-status">
          <span class="connection-indicator"></span>
          <span>${escapeHtml(clusterStatus)}</span>
        </div>
        <div class="cli-detection-list" aria-label="CLI availability">${cliTools.join('')}</div>
      </footer>
    </div>
  `;

  createIcons({ icons });
  bindEvents();
}

function settingsPageActions() {
  return {
    api: window.kubeApi,
    render,
    loadContexts,
    loadSnapshot,
  };
}

async function openSettings(): Promise<void> {
  await openSettingsPage(state, settingsPageActions());
}

async function openAbout(): Promise<void> {
  await openAboutPage(state, {
    getAbout: () => {
      const appInfo = window.appInfo;
      if (!appInfo) {
        throw new Error('Application information is unavailable.');
      }
      return appInfo.getAbout();
    },
    render,
  });
}

/**
 * Converts the current health summary into the four dashboard summary cards.
 * @returns Dashboard summary-grid HTML.
 */
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

/**
 * Renders the context-bound command prompt and its syntax-highlighted output.
 * @returns Terminal and output-pane HTML for the dashboard.
 */
function renderKubectlTerminal(): string {
  const kubectlDisabled = state.cliToolsAvailability?.kubectl.available !== true;
  const selectedContext = state.contexts.find(
    (context) => context.id === state.selectedContextId,
  );
  const contextName = selectedContext
    ? contextLabel(selectedContext)
    : state.snapshot.context;
  const output = state.kubectlResult
    ? [state.kubectlResult.stdout, state.kubectlResult.stderr]
        .filter(Boolean)
        .join('\n')
    : '';

  return `
    <section class="dashboard-terminal-grid ${state.outputExpanded ? 'expanded-output' : ''} ${kubectlDisabled ? 'kubectl-disabled' : ''}" aria-label="Kubectl terminal">
      <section class="dashboard-terminal-pane kubectl-command-pane">
        <header class="terminal-pane-heading">
          <h2><i data-lucide="terminal"></i> Terminal</h2>
          <div class="kubectl-terminal-header-actions">
            <button class="kubectl-clear-history" id="kubectl-clear-history" title="Clear history" aria-label="Clear history" ${kubectlDisabled || !state.kubectlHistory.length ? 'disabled' : ''}>
              <i data-lucide="trash-2"></i><span>Clear history</span>
            </button>
            <span class="kubectl-context" title="${escapeHtml(contextName)}">
              <i data-lucide="network"></i>${escapeHtml(contextName)}
            </span>
          </div>
        </header>
        <div class="kubectl-terminal-screen" aria-live="polite">
          ${state.kubectlHistory.length
            ? `<ol class="kubectl-history-list" aria-label="Command history">${state.kubectlHistory
                .map((command) => `<li class="kubectl-history-entry"><span>$</span><code>${escapeHtml(command)}</code></li>`)
                .join('')}</ol>`
            : '<div class="kubectl-terminal-idle"><i data-lucide="chevron-right"></i><span>kubectl</span></div>'}
          ${state.kubectlError ? `<p class="kubectl-terminal-error">${escapeHtml(state.kubectlError)}</p>` : ''}
        </div>
        <form class="kubectl-command-form" id="kubectl-form">
          <label class="kubectl-command-field">
            <svg class="kubectl-shortcut-hint" viewBox="0 0 108 28" aria-hidden="true" focusable="false">
              <rect x="1" y="2" width="20" height="24" rx="4"></rect>
              <text x="11" y="19" text-anchor="middle">k</text>
              <text class="kubectl-shortcut-plus" x="30" y="18" text-anchor="middle">+</text>
              <rect class="kubectl-spacebar" x="40" y="6" width="66" height="20" rx="4"></rect>
              <text class="kubectl-spacebar-label" x="73" y="19" text-anchor="middle">spacebar</text>
            </svg>
            <input id="kubectl-command" type="text" aria-label="Kubectl command" value="${escapeHtml(state.kubectlInput)}" placeholder="kubectl get pods -A" autocomplete="off" spellcheck="false" ${kubectlDisabled || state.kubectlRunning ? 'disabled' : ''} />
          </label>
          <button class="primary-button kubectl-run-button" id="kubectl-run" type="submit" ${kubectlDisabled || state.kubectlRunning ? 'disabled' : ''}>
            <i data-lucide="${state.kubectlRunning ? 'loader-circle' : 'play'}"></i>
            ${state.kubectlRunning ? 'Running' : 'Run'}
          </button>
        </form>
      </section>
      <section class="dashboard-terminal-pane kubectl-output-pane">
        <header class="terminal-pane-heading">
          <h2>
            <button class="kubectl-output-toggle" id="kubectl-output-toggle" aria-expanded="${state.outputExpanded}" aria-label="${state.outputExpanded ? 'Collapse output panel' : 'Expand output panel'}" ${kubectlDisabled ? 'disabled' : ''}>
              <i data-lucide="code-xml"></i><span>Output</span>
            </button>
          </h2>
          <div class="kubectl-output-actions">
            ${state.kubectlResult || state.kubectlError
              ? `<button class="kubectl-clear-output" id="kubectl-clear-output" title="Clear terminal output" aria-label="Clear terminal output" ${kubectlDisabled ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>Clear</span></button>`
              : ''}
            ${state.kubectlResult
              ? `<span class="kubectl-exit-status ${state.kubectlResult.exitCode === 0 ? 'success' : 'failure'}">Exit ${state.kubectlResult.exitCode}</span>`
              : ''}
          </div>
        </header>
        <pre class="kubectl-output" id="kubectl-output" aria-live="polite">${state.kubectlRunning
          ? '<span class="kubectl-output-muted">Running kubectl...</span>'
          : state.kubectlError
            ? `<span class="kubectl-status-error">${escapeHtml(state.kubectlError)}</span>`
            : state.kubectlResult
              ? highlightKubectlOutput(output)
              : '<span class="kubectl-output-muted">Awaiting output</span>'}</pre>
      </section>
      ${kubectlDisabled
        ? `<div class="kubectl-disabled-overlay" role="status" aria-live="polite">
            <div class="kubectl-disabled-message">
              <i data-lucide="terminal" aria-hidden="true"></i>
              <h2>${state.cliToolsAvailability ? 'Terminal unavailable' : 'Checking kubectl'}</h2>
              <p>${escapeHtml(state.kubectlAvailabilityMessage)}</p>
            </div>
          </div>`
        : ''}
    </section>
  `;
}

/**
 * Renders one metric card with a bounded progress meter and semantic tone.
 * @param title - Metric label shown in the card.
 * @param value - Primary metric value.
 * @param percent - Progress value clamped to the inclusive range 0–100.
 * @param icon - Lucide icon name displayed with the title.
 * @param tone - Semantic status tone applied to the card.
 * @returns Metric-card HTML.
 */
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

/**
 * Sorts visible resources and renders the resource table, including selection/status state.
 * @param resources - Filtered resources to display in the active table.
 * @returns Resource-table or empty-state HTML.
 */
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

/**
 * Renders the selected resource's facts, labels, event message, and YAML manifest.
 * @param resource - Selected resource, when one is present.
 * @returns Inspector HTML, or an empty string when no resource is selected.
 */
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

/**
 * Produces the optional Event message section for the inspector.
 * @param resource - Event resource whose message is displayed.
 * @returns Escaped Event message section HTML.
 */
function renderEventMessage(resource: KubeResource): string {
  return `
    <section class="detail-section">
      <h3>Message</h3>
      <p class="event-message">${escapeHtml(resource.message || 'No event message available.')}</p>
    </section>
  `;
}

/**
 * Renders one label/value pair in the inspector facts grid.
 * @param label - Fact name displayed to the user.
 * @param value - Fact value displayed beside its name.
 * @returns Fact-row HTML.
 */
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

/**
 * Wires dashboard controls to state updates, data loading, selection, and clipboard actions.
 * @returns Nothing; attaches event handlers to the currently rendered dashboard.
 */
function bindEvents() {
  document.querySelector('terminal-panel')?.addEventListener('panel-state-change', (event) => {
    state.terminalPanelOpen = (event as CustomEvent<boolean>).detail;
  });

  document.querySelector<HTMLButtonElement>('#open-settings')?.addEventListener('click', () => {
    void openSettings();
  });

  document.querySelector<HTMLButtonElement>('#open-terminal-panel')?.addEventListener('click', () => {
    document.querySelector('terminal-panel')?.dispatchEvent(
      new Event('terminal-panel-request-open'),
    );
  });

  document.querySelector<HTMLButtonElement>('#kubectl-clear-history')?.addEventListener('click', () => {
    state.kubectlHistory = [];
    render();
  });

  document.querySelector<HTMLButtonElement>('#kubectl-clear-output')?.addEventListener('click', () => {
    clearKubectlOutput();
    render();
  });

  document.querySelector<HTMLButtonElement>('#kubectl-output-toggle')?.addEventListener('click', () => {
    state.outputExpanded = !state.outputExpanded;
    render();
  });

  document.querySelector<HTMLInputElement>('#kubectl-command')?.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.value.startsWith('k ')) {
      const selectionStart = target.selectionStart ?? target.value.length;
      const selectionEnd = target.selectionEnd ?? target.value.length;
      target.value = `kubectl ${target.value.slice(2)}`;
      target.setSelectionRange(selectionStart + 6, selectionEnd + 6);
    }
    state.kubectlInput = target.value;
  });

  document.querySelector<HTMLInputElement>('#kubectl-command')?.addEventListener('keydown', (event) => {
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
    state.kubectlInput = target.value;
    target.setSelectionRange(target.value.length, target.value.length);
  });

  document.querySelector<HTMLFormElement>('#kubectl-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const command = state.kubectlInput.trim();
    if (!command || state.kubectlRunning) {
      return;
    }

    state.kubectlInput = '';
    state.kubectlHistory.push(command);
    if (state.kubectlHistory.length > 1000) {
      state.kubectlHistory.splice(0, state.kubectlHistory.length - 1000);
    }
    state.kubectlResult = null;
    state.kubectlError = '';
    state.kubectlRunning = true;
    const requestId = ++state.kubectlRequestId;
    render();
    scrollKubectlHistoryToBottom();

    void (async () => {
      try {
        if (!window.kubeApi?.runKubectl) {
          throw new Error('Kubectl command execution is unavailable.');
        }

        const result = await window.kubeApi.runKubectl(command, state.selectedContextId);
        if (requestId === state.kubectlRequestId) {
          state.kubectlResult = { ...result, command };
        }
      } catch (error) {
        if (requestId === state.kubectlRequestId) {
          state.kubectlError = error instanceof Error
            ? error.message
            : 'Unable to run kubectl command.';
        }
      } finally {
        if (requestId === state.kubectlRequestId) {
          state.kubectlRunning = false;
          render();
          scrollKubectlHistoryToBottom();
        }
      }
    })();
  });

  document.querySelectorAll<HTMLButtonElement>('.nav-group-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.dataset.group;
      if (!group) {
        return;
      }

      state.collapsedNavGroups[group] = !state.collapsedNavGroups[group];
      render();
    });
  });

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
      clearKubectlOutput();
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
      if (
        state.section === 'replicasets' ||
        state.section === 'jobs' ||
        state.section === 'cronjobs' ||
        state.section === 'pvs' ||
        state.section === 'storageclasses' ||
        state.section === 'namespaces' ||
        state.section === 'serviceaccounts' ||
        state.section === 'clusterroles' ||
        state.section === 'roles' ||
        state.section === 'clusterrolebindings' ||
        state.section === 'rolebindings'
      ) {
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
      clearKubectlOutput();
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

/**
 * Checks local CLI availability before enabling the Dashboard terminal.
 * @returns A promise that resolves after availability state is updated and rendered.
 */
async function checkCliToolsAvailability(): Promise<void> {
  try {
    if (!window.kubeApi?.checkCliTools) {
      throw new Error('The CLI availability check is unavailable.');
    }

    state.cliToolsAvailability = await window.kubeApi.checkCliTools();
    state.kubectlAvailabilityMessage = state.cliToolsAvailability.kubectl.message;
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Unable to check CLI availability.';
    state.cliToolsAvailability = {
      kubectl: { available: false, message },
      docker: { available: false, message },
      kind: { available: false, message },
    };
    state.kubectlAvailabilityMessage = message;
  }

  render();
}

/**
 * Loads available kubeconfig contexts through preload and selects a sensible default.
 * @returns A promise that resolves after context state has been updated.
 */
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

/**
 * Fetches the selected namespace snapshot, falling back to demo data on API failure.
 * @returns A promise that resolves after the snapshot and loading state are updated.
 */
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

/**
 * Loads a resource collection on demand and merges it into the current snapshot.
 * @param kind - Resource collection to request.
 * @returns A promise that resolves after resources and loading state are updated.
 */
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

/**
 * Creates a complete demo snapshot used when kubectl is unavailable.
 * @returns Snapshot populated with representative Kubernetes resource fixtures.
 */
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

/**
 * Produces an ISO timestamp relative to now for realistic fixture ages.
 * @param hoursOffset - Number of hours from now; negative values represent the past.
 * @returns ISO-formatted timestamp.
 */
export function timestamp(hoursOffset: number): string {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

/**
 * Creates a namespace fixture with standard Kubernetes metadata and an Active phase.
 * @param name - Namespace name.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns Namespace resource fixture.
 */
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

/**
 * Creates a node fixture with role labels, capacity, version, and a Ready condition.
 * @param name - Node name.
 * @param role - Node role label value.
 * @param version - Kubelet version string.
 * @param cpu - CPU capacity quantity.
 * @param memory - Memory capacity quantity.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns Node resource fixture.
 */
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

/**
 * Creates a pod fixture with container readiness, restart counts, and node placement.
 * @param namespaceName - Namespace containing the Pod.
 * @param name - Pod name.
 * @param phase - Kubernetes Pod phase.
 * @param ready - Ready/total container count string, such as `2/2`.
 * @param restarts - Restart count assigned to the first container.
 * @param nodeName - Node on which the Pod is scheduled.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns Pod resource fixture.
 */
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
        'app.kubernetes.io/managed-by': 'orbita',
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

/**
 * Creates a Deployment or StatefulSet fixture with replica and availability counters.
 * @param kind - Workload kind to create.
 * @param namespaceName - Namespace containing the workload.
 * @param name - Workload name.
 * @param replicas - Desired replica count.
 * @param readyReplicas - Number of replicas currently ready.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns Deployment or StatefulSet resource fixture.
 */
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

/**
 * Creates a DaemonSet fixture using scheduled and available node counts.
 * @param namespaceName - Namespace containing the DaemonSet.
 * @param name - DaemonSet name.
 * @param desired - Desired node count.
 * @param available - Number of nodes with an available Pod.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns DaemonSet resource fixture.
 */
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

/**
 * Creates a Service fixture from a compact port specification such as `443:32443/TCP`.
 * @param namespaceName - Namespace containing the Service.
 * @param name - Service name.
 * @param type - Kubernetes Service type.
 * @param clusterIP - Assigned cluster IP.
 * @param portSpec - Service port, optional node port, and optional protocol.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns Service resource fixture.
 */
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

/**
 * Creates an Ingress fixture with its class name and host rules.
 * @param namespaceName - Namespace containing the Ingress.
 * @param name - Ingress name.
 * @param ingressClassName - Ingress class name.
 * @param hosts - Hostnames included in the Ingress rules.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns Ingress resource fixture.
 */
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

/**
 * Creates a ConfigMap fixture whose keys contain placeholder managed configuration.
 * @param namespaceName - Namespace containing the ConfigMap.
 * @param name - ConfigMap name.
 * @param keys - Data keys to include in the fixture.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns ConfigMap resource fixture.
 */
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

/**
 * Creates a Secret fixture with redacted placeholder values for the requested keys.
 * @param namespaceName - Namespace containing the Secret.
 * @param name - Secret name.
 * @param type - Kubernetes Secret type.
 * @param keys - Data keys to include with redacted placeholder values.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns Secret resource fixture.
 */
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

/**
 * Creates a PersistentVolumeClaim fixture with storage class and capacity information.
 * @param namespaceName - Namespace containing the claim.
 * @param name - Claim name.
 * @param phase - Kubernetes claim phase.
 * @param storage - Requested or provisioned storage quantity.
 * @param storageClassName - StorageClass associated with the claim.
 * @param hoursOffset - Creation-time offset in hours relative to now.
 * @returns PersistentVolumeClaim resource fixture.
 */
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

/**
 * Creates an Event fixture tied to a named involved object and recent timestamp.
 * @param namespaceName - Namespace containing the Event and involved object.
 * @param objectName - Name of the involved object.
 * @param type - Event type, such as Normal or Warning.
 * @param reason - Kubernetes event reason.
 * @param message - Human-readable event message.
 * @param count - Number of occurrences represented by the Event.
 * @param hoursOffset - Event-time offset in hours relative to now.
 * @returns Event resource fixture.
 */
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
  render();
  window.appInfo?.onShowAbout(() => {
    void openAbout();
  });
  window.appInfo?.onShowSettings(() => {
    void openSettings();
  });
  await Promise.all([loadContexts(), checkCliToolsAvailability()]);
  await loadSnapshot();
})();
