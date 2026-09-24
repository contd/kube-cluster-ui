import YAML from 'yaml';
import type {
  ClusterContext,
  Column,
  KubeResource,
  Metadata,
  NavItem,
  ResourceKind,
  Snapshot,
  StatusTone,
} from './app.types';

export const navItems: NavItem[] = [
  { kind: 'dashboard', label: 'Dashboard', group: 'Cluster', icon: 'layout-dashboard' },
  { kind: 'nodes', label: 'Nodes', group: 'Cluster', icon: 'server' },
  { kind: 'pods', label: 'Pods', group: 'Workloads', icon: 'box' },
  { kind: 'deployments', label: 'Deployments', group: 'Workloads', icon: 'boxes' },
  { kind: 'daemonsets', label: 'DaemonSets', group: 'Workloads', icon: 'refresh-cw' },
  { kind: 'statefulsets', label: 'StatefulSets', group: 'Workloads', icon: 'database' },
  { kind: 'services', label: 'Services', group: 'Network', icon: 'route' },
  { kind: 'ingresses', label: 'Ingresses', group: 'Network', icon: 'globe-2' },
  { kind: 'configmaps', label: 'ConfigMaps', group: 'Configuration', icon: 'file-cog' },
  { kind: 'secrets', label: 'Secrets', group: 'Configuration', icon: 'key' },
  { kind: 'pvcs', label: 'PVCs', group: 'Storage', icon: 'hard-drive' },
  { kind: 'events', label: 'Events', group: 'Observability', icon: 'bell' },
];

export const namespacedKinds = new Set<ResourceKind>([
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

/**
 * Traverses an unknown Kubernetes object by key path without throwing when an
 * intermediate field is absent or has a non-object value.
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
 * Normalizes API values for display: nullish/empty values use the fallback,
 * arrays become comma-separated text, and all other values use String().
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

/** Returns resource metadata while giving callers a safe empty object fallback. */
export function metadata(resource: KubeResource): Metadata {
  return resource.metadata || {};
}

/** Resolves the display name, using an Event's involved object before its own name. */
export function resourceName(resource: KubeResource): string {
  if (resource.kind === 'Event') {
    return resource.involvedObject?.name || metadata(resource).name || '-';
  }

  return metadata(resource).name || '-';
}

/** Resolves namespace ownership and supplies cluster/default values for unnamespaced resources. */
export function resourceNamespace(resource: KubeResource): string {
  return (
    metadata(resource).namespace ||
    resource.involvedObject?.namespace ||
    (resource.kind === 'Node' ? 'cluster' : 'default')
  );
}

/** Creates the namespace/name identity used to correlate rows with the selected resource. */
export function resourceId(resource: KubeResource): string {
  return `${resourceNamespace(resource)}:${metadata(resource).name || resourceName(resource)}`;
}

/** Converts an ISO timestamp into a compact minutes/hours/days elapsed label. */
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

/** Counts ready pod containers and returns the Kubernetes-style ready/total value. */
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

/** Reads ready and desired replica counts from status/spec and formats them as ready/desired. */
export function workloadReady(resource: KubeResource): string {
  const ready = stringValue(objectValue(resource.status, ['readyReplicas']), '0');
  const desired = stringValue(
    objectValue(resource.status, ['replicas']) || objectValue(resource.spec, ['replicas']),
    '0',
  );

  return `${ready}/${desired}`;
}

/** Interprets the node Ready condition and distinguishes Ready, NotReady, and unknown data. */
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

/** Selects the resource-kind-specific status field used by tables, filtering, and summaries. */
export function statusFor(resource: KubeResource, kind: ResourceKind): string {
  if (kind === 'pods') return stringValue(objectValue(resource.status, ['phase']));
  if (kind === 'nodes') return nodePressure(resource);
  if (kind === 'events') return resource.type || 'Normal';
  if (kind === 'pvcs') return stringValue(objectValue(resource.status, ['phase']));
  if (kind === 'secrets') return stringValue(resource.type);
  if (['deployments', 'daemonsets', 'statefulsets'].includes(kind)) return workloadReady(resource);
  return stringValue(objectValue(resource.spec, ['type']));
}

/** Maps normalized status text to a semantic UI tone for healthy, warning, danger, or neutral. */
export function statusTone(resource: KubeResource, kind: ResourceKind): StatusTone {
  const status = statusFor(resource, kind).toLowerCase();

  if (['running', 'ready', 'bound', 'normal', 'clusterip', 'loadbalancer', '1/1', '2/2', '3/3'].some((value) => status.includes(value))) {
    return 'healthy';
  }
  if (['pending', 'warning', '0/'].some((value) => status.includes(value))) return 'warning';
  if (['failed', 'error', 'notready', 'backoff'].some((value) => status.includes(value))) return 'danger';
  return 'neutral';
}

/** Builds the column definitions and resource readers required by each table category. */
export function columnsFor(kind: ResourceKind): Column[] {
  const common: Column[] = [
    { label: 'Namespace', value: resourceNamespace },
    { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
  ];

  if (kind === 'nodes') {
    return [
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      { label: 'Roles', value: (resource) => Object.keys(metadata(resource).labels || {}).filter((label) => label.startsWith('node-role.kubernetes.io/')).map((label) => label.replace('node-role.kubernetes.io/', '')).join(', ') || 'worker' },
      { label: 'Version', value: (resource) => stringValue(objectValue(resource.status, ['nodeInfo', 'kubeletVersion'])) },
      { label: 'CPU', value: (resource) => stringValue(objectValue(resource.status, ['capacity', 'cpu'])) },
      { label: 'Memory', value: (resource) => stringValue(objectValue(resource.status, ['capacity', 'memory'])) },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'pods') {
    return [
      ...common,
      { label: 'Ready', value: podReady },
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      { label: 'Restarts', value: (resource) => { const statuses = objectValue(resource.status, ['containerStatuses']); if (!Array.isArray(statuses)) return '0'; return String(statuses.reduce((total, status) => total + Number((status as Record<string, unknown>).restartCount || 0), 0)); } },
      { label: 'Node', value: (resource) => stringValue(objectValue(resource.spec, ['nodeName'])) },
    ];
  }

  if (['deployments', 'daemonsets', 'statefulsets'].includes(kind)) {
    return [
      ...common,
      { label: 'Ready', value: (resource) => statusFor(resource, kind) },
      { label: 'Up To Date', value: (resource) => stringValue(objectValue(resource.status, ['updatedReplicas']) || objectValue(resource.status, ['currentNumberScheduled']), '0') },
      { label: 'Available', value: (resource) => stringValue(objectValue(resource.status, ['availableReplicas']) || objectValue(resource.status, ['numberAvailable']), '0') },
    ];
  }

  if (kind === 'services') {
    return [
      ...common,
      { label: 'Type', value: (resource) => statusFor(resource, kind) },
      { label: 'Cluster IP', value: (resource) => stringValue(objectValue(resource.spec, ['clusterIP'])) },
      { label: 'Ports', value: (resource) => { const ports = objectValue(resource.spec, ['ports']); if (!Array.isArray(ports)) return '-'; return ports.map((port) => { const typed = port as Record<string, unknown>; return `${typed.port}${typed.nodePort ? `:${typed.nodePort}` : ''}/${typed.protocol || 'TCP'}`; }).join(', '); } },
    ];
  }

  if (kind === 'ingresses') {
    return [
      ...common,
      { label: 'Class', value: (resource) => stringValue(objectValue(resource.spec, ['ingressClassName'])) },
      { label: 'Hosts', value: (resource) => { const rules = objectValue(resource.spec, ['rules']); if (!Array.isArray(rules)) return '-'; return rules.map((rule) => stringValue((rule as Record<string, unknown>).host)).join(', '); } },
    ];
  }

  if (kind === 'configmaps') return [...common, { label: 'Keys', value: (resource) => String(Object.keys(resource.data || {}).length) }];
  if (kind === 'secrets') return [...common, { label: 'Type', value: (resource) => statusFor(resource, kind) }, { label: 'Keys', value: (resource) => String(Object.keys(resource.data || {}).length) }];
  if (kind === 'pvcs') return [...common, { label: 'Status', value: (resource) => statusFor(resource, kind) }, { label: 'Capacity', value: (resource) => stringValue(objectValue(resource.status, ['capacity', 'storage'])) }, { label: 'StorageClass', value: (resource) => stringValue(objectValue(resource.spec, ['storageClassName'])) }];

  return [
    { label: 'Namespace', value: resourceNamespace },
    { label: 'Type', value: (resource) => resource.type || 'Normal' },
    { label: 'Reason', value: (resource) => resource.reason || '-' },
    { label: 'Object', value: resourceName },
    { label: 'Count', value: (resource) => String(resource.count || 1) },
    { label: 'Last Seen', value: (resource) => age(resource.lastTimestamp || metadata(resource).creationTimestamp) },
  ];
}

/** Escapes Kubernetes-provided text before it is interpolated into renderer HTML. */
export function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

/** Produces YAML for a resource while removing server-managed metadata fields from the preview. */
export function formatManifest(resource: KubeResource): string {
  const manifest = {
    apiVersion: resource.apiVersion ?? 'v1',
    kind: resource.kind ?? 'Resource',
    metadata: { ...metadata(resource) },
    ...(resource.spec ? { spec: resource.spec } : {}),
    ...(resource.status ? { status: resource.status } : {}),
    ...(resource.data ? { data: resource.data } : {}),
    ...Object.fromEntries(Object.entries(resource).filter(([key]) => !['apiVersion', 'kind', 'metadata', 'spec', 'status', 'data'].includes(key))),
  } as Record<string, unknown> & { metadata: Record<string, unknown> };

  delete manifest.metadata.managedFields;
  return YAML.stringify(manifest);
}

/** Escapes YAML and adds CSS spans for keys, scalar values, and comments in the manifest viewer. */
export function highlightYaml(yaml: string): string {
  return yaml.split('\n').map((line) => {
    let highlighted = escapeHtml(line);
    highlighted = highlighted.replace(/^(\s*)([-]?\s*)([^:#]+)(:)/, '$1$2<span class="yaml-key">$3</span>$4');
    highlighted = highlighted.replace(/(:\s+)(["'].*?["']|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)(?=\s*$)/, '$1<span class="yaml-value">$2</span>');
    highlighted = highlighted.replace(/(#.*)$/, '<span class="yaml-comment">$1</span>');
    return highlighted;
  }).join('\n');
}

/** Reads one resource collection from a snapshot and returns an empty list for missing data. */
export function getResources(snapshot: Snapshot, kind: ResourceKind): KubeResource[] {
  return snapshot.resources[kind] || [];
}

/** Filters resources by namespace and a case-insensitive search across names, status, and metadata. */
export function getVisibleResources(snapshot: Snapshot, selectedKind: ResourceKind, namespace: string, query: string): KubeResource[] {
  const normalizedQuery = query.trim().toLowerCase();
  return getResources(snapshot, selectedKind).filter((resource) => {
    const namespaceMatches = namespace === 'all' || !namespacedKinds.has(selectedKind) || resourceNamespace(resource) === namespace;
    if (!namespaceMatches) return false;
    if (!normalizedQuery) return true;
    return [resourceName(resource), metadata(resource).name, resourceNamespace(resource), statusFor(resource, selectedKind), resource.reason, resource.message, JSON.stringify(metadata(resource).labels || {})].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
  });
}

/** Finds the currently selected resource from an already filtered collection. */
export function selectedResource(resources: KubeResource[], selectedResourceId: string): KubeResource | undefined {
  return resources.find((resource) => resourceId(resource) === selectedResourceId);
}

/** Extracts unique namespace names, sorts them, and prepends the all-namespaces option. */
export function namespaceOptions(snapshot: Snapshot): string[] {
  const namespaces = snapshot.namespaces.map((resource) => metadata(resource).name).filter((name): name is string => Boolean(name));
  return ['all', ...Array.from(new Set(namespaces)).sort()];
}

/** Chooses the most useful visible label for a kube context, with a final unknown fallback. */
export function contextLabel(context: ClusterContext): string {
  return context.name || context.fileName || 'Unknown context';
}

/** Aggregates pod, node, workload, and event readiness metrics for the dashboard summary. */
export function healthSummary(snapshot: Snapshot) {
  const pods = getResources(snapshot, 'pods');
  const nodes = getResources(snapshot, 'nodes');
  const events = getResources(snapshot, 'events');
  const workloads = [...getResources(snapshot, 'deployments'), ...getResources(snapshot, 'daemonsets'), ...getResources(snapshot, 'statefulsets')];
  const runningPods = pods.filter((pod) => statusFor(pod, 'pods') === 'Running').length;
  const readyNodes = nodes.filter((node) => statusFor(node, 'nodes') === 'Ready').length;
  const warnings = events.filter((event) => event.type === 'Warning').length;
  const readyWorkloads = workloads.filter((resource) => { const ready = statusFor(resource, 'deployments').split('/'); return ready[0] === ready[1]; }).length;
  return { pods, nodes, events, workloads, runningPods, readyNodes, warnings, readyWorkloads };
}

/** Resolves the navigation label for a resource kind and falls back to the raw kind value. */
export function kindLabel(kind: ResourceKind): string {
  return navItems.find((item) => item.kind === kind)?.label || kind;
}