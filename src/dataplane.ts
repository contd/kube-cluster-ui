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
  { kind: 'namespaces', label: 'Namespaces', group: 'Cluster', icon: 'layers-2' },
  { kind: 'pods', label: 'Pods', group: 'Workloads', icon: 'box' },
  { kind: 'deployments', label: 'Deployments', group: 'Workloads', icon: 'boxes' },
  { kind: 'daemonsets', label: 'DaemonSets', group: 'Workloads', icon: 'refresh-cw' },
  { kind: 'statefulsets', label: 'StatefulSets', group: 'Workloads', icon: 'database' },
  { kind: 'replicasets', label: 'ReplicaSets', group: 'Workloads', icon: 'copy' },
  { kind: 'jobs', label: 'Jobs', group: 'Workloads', icon: 'briefcase-business' },
  { kind: 'cronjobs', label: 'CronJobs', group: 'Workloads', icon: 'calendar-clock' },
  { kind: 'services', label: 'Services', group: 'Network', icon: 'route' },
  { kind: 'ingresses', label: 'Ingresses', group: 'Network', icon: 'globe-2' },
  { kind: 'serviceaccounts', label: 'Service Accounts', group: 'Access Control', icon: 'user-round' },
  { kind: 'clusterroles', label: 'Cluster Roles', group: 'Access Control', icon: 'shield' },
  { kind: 'roles', label: 'Roles', group: 'Access Control', icon: 'key-round' },
  { kind: 'clusterrolebindings', label: 'Cluster Role Bindings', group: 'Access Control', icon: 'shield-check' },
  { kind: 'rolebindings', label: 'Role Bindings', group: 'Access Control', icon: 'link' },
  { kind: 'configmaps', label: 'ConfigMaps', group: 'Configuration', icon: 'file-cog' },
  { kind: 'secrets', label: 'Secrets', group: 'Configuration', icon: 'key' },
  { kind: 'pvcs', label: 'PVCs', group: 'Storage', icon: 'hard-drive' },
  { kind: 'pvs', label: 'PV', group: 'Storage', icon: 'database' },
  { kind: 'storageclasses', label: 'Storage Class', group: 'Storage', icon: 'layers-3' },
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
  'serviceaccounts',
  'roles',
  'rolebindings',
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

/** Converts Kubernetes memory quantities into compact binary-unit display text. */
export function humanReadableMemory(value: unknown): string {
  const raw = stringValue(value, '').trim();
  const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)(Ei|Pi|Ti|Gi|Mi|Ki|E|P|T|G|M|K|B)?$/i);
  if (!match) {
    return raw || '-';
  }

  const amount = Number(match[1]);
  const unit = (match[2] || 'B').toLowerCase();
  const factors: Record<string, number> = {
    b: 1,
    k: 1000,
    m: 1000 ** 2,
    g: 1000 ** 3,
    t: 1000 ** 4,
    p: 1000 ** 5,
    e: 1000 ** 6,
    ki: 1024,
    mi: 1024 ** 2,
    gi: 1024 ** 3,
    ti: 1024 ** 4,
    pi: 1024 ** 5,
    ei: 1024 ** 6,
  };
  const bytes = amount * factors[unit];

  if (!Number.isFinite(bytes)) {
    return raw;
  }

  const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];
  let unitIndex = 0;
  let displayValue = bytes;
  while (displayValue >= 1024 && unitIndex < units.length - 1) {
    displayValue /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : 1;
  return `${displayValue.toFixed(precision)} ${units[unitIndex]}`;
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

/** Formats a workload's updated and available pod counts as updated/available. */
export function workloadPods(resource: KubeResource): string {
  const updated = objectValue(resource.status, ['updatedReplicas']) ??
    objectValue(resource.status, ['currentNumberScheduled']) ??
    0;
  const available = objectValue(resource.status, ['availableReplicas']) ??
    objectValue(resource.status, ['numberAvailable']) ??
    0;
  return `${stringValue(updated, '0')}/${stringValue(available, '0')}`;
}

/** Returns the desired replica count for a workload from status or spec. */
export function workloadReplicas(resource: KubeResource): string {
  const replicas = objectValue(resource.status, ['replicas']) ??
    objectValue(resource.spec, ['replicas']) ??
    objectValue(resource.status, ['desiredNumberScheduled']) ??
    0;
  return stringValue(replicas, '0');
}

/** Returns the DaemonSet desired node count. */
export function daemonsetDesired(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['desiredNumberScheduled']), '0');
}

/** Returns the DaemonSet current scheduled node count. */
export function daemonsetCurrent(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['currentNumberScheduled']), '0');
}

/** Returns the DaemonSet ready node count. */
export function daemonsetReady(resource: KubeResource): string {
  return stringValue(
    objectValue(resource.status, ['numberReady']) ??
      objectValue(resource.status, ['readyReplicas']),
    '0',
  );
}

/** Returns the DaemonSet up-to-date node count. */
export function daemonsetUpToDate(resource: KubeResource): string {
  return stringValue(
    objectValue(resource.status, ['updatedNumberScheduled']) ??
      objectValue(resource.status, ['updatedReplicas']) ??
      objectValue(resource.status, ['currentNumberScheduled']),
    '0',
  );
}

/** Returns the DaemonSet available node count. */
export function daemonsetAvailable(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['numberAvailable']), '0');
}

/** Returns the desired ReplicaSet pod count from its spec. */
export function replicasetDesired(resource: KubeResource): string {
  return stringValue(objectValue(resource.spec, ['replicas']), '0');
}

/** Returns the current ReplicaSet pod count from status. */
export function replicasetCurrent(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['replicas']), '0');
}

/** Returns the ready ReplicaSet pod count from status. */
export function replicasetReady(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['readyReplicas']), '0');
}

/** Maps Job status fields to a concise lifecycle label. */
export function jobStatus(resource: KubeResource): string {
  const conditions = objectValue(resource.status, ['conditions']);
  if (Array.isArray(conditions)) {
    const failed = conditions.some((condition) => {
      const typed = condition as Record<string, unknown>;
      return typed.type === 'Failed' && typed.status === 'True';
    });
    if (failed) return 'Failed';

    const complete = conditions.some((condition) => {
      const typed = condition as Record<string, unknown>;
      return typed.type === 'Complete' && typed.status === 'True';
    });
    if (complete) return 'Complete';
  }

  if (Number(objectValue(resource.status, ['failed']) || 0) > 0) return 'Failed';
  if (Number(objectValue(resource.status, ['succeeded']) || 0) > 0) return 'Complete';
  return Number(objectValue(resource.status, ['active']) || 0) > 0 ? 'Running' : 'Pending';
}

/** Formats completed and desired Job pod counts as completed/desired. */
export function jobCompletion(resource: KubeResource): string {
  return `${stringValue(objectValue(resource.status, ['succeeded']), '0')}/${stringValue(objectValue(resource.spec, ['completions']), '1')}`;
}

/** Calculates Job runtime from start and completion timestamps. */
export function jobDuration(resource: KubeResource): string {
  const start = objectValue(resource.status, ['startTime']);
  if (typeof start !== 'string') return '-';
  const end = objectValue(resource.status, ['completionTime']);
  const elapsed = (typeof end === 'string' ? Date.parse(end) : Date.now()) - Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed < 0) return '-';
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/** Returns the Job start timestamp from Kubernetes status. */
export function jobStartTime(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['startTime']));
}

/** Returns the Job completion timestamp from Kubernetes status. */
export function jobEndTime(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['completionTime']));
}

/** Returns the number of ready Job pods. */
export function jobReady(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['ready']), '0');
}

/** Returns the number of successfully completed Job pods. */
export function jobSucceeded(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['succeeded']), '0');
}

/** Indicates whether Kubernetes has marked the Job for deletion. */
export function jobTerminating(resource: KubeResource): string {
  const deletionTimestamp = objectValue(
    resource.metadata as Record<string, unknown> | undefined,
    ['deletionTimestamp'],
  );
  return deletionTimestamp ? 'Yes' : 'No';
}

/** Returns a CronJob's configured cron schedule. */
export function cronJobSchedule(resource: KubeResource): string {
  return stringValue(objectValue(resource.spec, ['schedule']));
}

/** Returns whether a CronJob is suspended. */
export function cronJobSuspend(resource: KubeResource): string {
  return objectValue(resource.spec, ['suspend']) === true ? 'Yes' : 'No';
}

/** Returns the number of currently active CronJob child Jobs. */
export function cronJobActive(resource: KubeResource): string {
  const active = objectValue(resource.status, ['active']);
  return Array.isArray(active) ? String(active.length) : '0';
}

/** Returns the timestamp of the most recent CronJob schedule. */
export function cronJobLastSchedule(resource: KubeResource): string {
  return stringValue(objectValue(resource.status, ['lastScheduleTime']));
}

/** Returns the PersistentVolume storage class. */
export function pvStorageClass(resource: KubeResource): string {
  return stringValue(objectValue(resource.spec, ['storageClassName']));
}

/** Returns the PersistentVolume storage capacity. */
export function pvCapacity(resource: KubeResource): string {
  return stringValue(objectValue(resource.spec, ['capacity', 'storage']));
}

/** Returns the namespace/name claim reference attached to a PersistentVolume. */
export function pvClaim(resource: KubeResource): string {
  const claim = objectValue(resource.spec, ['claimRef']) as Record<string, unknown> | undefined;
  if (!claim) return '-';
  const namespace = stringValue(claim.namespace, '');
  const name = stringValue(claim.name, '');
  return namespace && name ? `${namespace}/${name}` : name || namespace || '-';
}

/** Maps PersistentVolume phase to Bound or Unbound. */
export function pvStatus(resource: KubeResource): string {
  return objectValue(resource.status, ['phase']) === 'Bound' ? 'Bound' : 'Unbound';
}

/** Returns a compact, 100-character maximum summary of resource labels. */
export function labelsSummary(resource: KubeResource): string {
  const labels = Object.entries(metadata(resource).labels || {})
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  return labels.slice(0, 100) || '-';
}

/** Returns a StorageClass provisioner. */
export function storageClassProvisioner(resource: KubeResource): string {
  return stringValue(
    resource.provisioner ??
      objectValue(resource.spec, ['provisioner']),
  );
}

/** Returns a StorageClass reclaim policy with Kubernetes' default fallback. */
export function storageClassReclaimPolicy(resource: KubeResource): string {
  return stringValue(objectValue(resource.spec, ['reclaimPolicy']), 'Delete');
}

/** Returns a StorageClass volume binding mode with Kubernetes' default fallback. */
export function storageClassBindingMode(resource: KubeResource): string {
  return stringValue(objectValue(resource.spec, ['volumeBindingMode']), 'Immediate');
}

/** Returns whether a StorageClass allows volume expansion. */
export function storageClassExpansion(resource: KubeResource): string {
  return objectValue(resource.spec, ['allowVolumeExpansion']) === true ? 'Yes' : 'No';
}

/** Returns the number of container statuses defined for a Pod. */
export function podContainerCount(resource: KubeResource): string {
  const containerStatuses = objectValue(resource.status, ['containerStatuses']);
  return Array.isArray(containerStatuses) ? String(containerStatuses.length) : '0';
}

/** Returns the name of the first Kubernetes controller owner for a resource. */
export function controlledBy(resource: KubeResource): string {
  const ownerReferences = objectValue(
    resource.metadata as Record<string, unknown> | undefined,
    ['ownerReferences'],
  );
  if (!Array.isArray(ownerReferences)) {
    return '-';
  }

  const owner = ownerReferences[0] as Record<string, unknown> | undefined;
  return stringValue(owner?.name);
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
  if (kind === 'namespaces') return stringValue(objectValue(resource.status, ['phase']));
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
      { label: 'Taints', value: (resource) => { const taints = objectValue(resource.spec, ['taints']); return Array.isArray(taints) ? String(taints.length) : '0'; } },
      { label: 'Version', value: (resource) => stringValue(objectValue(resource.status, ['nodeInfo', 'kubeletVersion'])) },
      { label: 'CPU', value: (resource) => stringValue(objectValue(resource.status, ['capacity', 'cpu'])) },
      { label: 'Memory', value: (resource) => humanReadableMemory(objectValue(resource.status, ['allocatable', 'memory']) || objectValue(resource.status, ['capacity', 'memory'])) },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'pods') {
    return [
      ...common,
      { label: 'Containers', value: podContainerCount },
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      { label: 'Restarts', value: (resource) => { const statuses = objectValue(resource.status, ['containerStatuses']); if (!Array.isArray(statuses)) return '0'; return String(statuses.reduce((total, status) => total + Number((status as Record<string, unknown>).restartCount || 0), 0)); } },
      { label: 'Node', value: (resource) => stringValue(objectValue(resource.spec, ['nodeName'])) },
      { label: 'Controlled By', value: controlledBy },
    ];
  }

  if (kind === 'daemonsets') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Desired', value: daemonsetDesired },
      { label: 'Current', value: daemonsetCurrent },
      { label: 'Ready', value: daemonsetReady },
      { label: 'Up-to-Date', value: daemonsetUpToDate },
      { label: 'Available', value: daemonsetAvailable },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'replicasets') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Desired', value: replicasetDesired },
      { label: 'Current', value: replicasetCurrent },
      { label: 'Ready', value: replicasetReady },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'jobs') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Start Time', value: jobStartTime },
      { label: 'End Time', value: jobEndTime },
      { label: 'Ready', value: jobReady },
      { label: 'Succeded', value: jobSucceeded },
      { label: 'Terminating', value: jobTerminating },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'cronjobs') {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Schedule', value: cronJobSchedule },
      { label: 'Suspend', value: cronJobSuspend },
      { label: 'Active', value: cronJobActive },
      { label: 'Last Schedule', value: cronJobLastSchedule },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
    ];
  }

  if (kind === 'pvs') {
    return [
      { label: 'Storage Class', value: pvStorageClass },
      { label: 'Capacity', value: pvCapacity },
      { label: 'Claim', value: pvClaim },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
      { label: 'Status', value: pvStatus },
    ];
  }

  if (kind === 'namespaces') {
    return [
      { label: 'Status', value: (resource) => statusFor(resource, kind) },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
      { label: 'Labels', value: labelsSummary },
    ];
  }

  if (kind === 'storageclasses') {
    return [
      { label: 'Provisioner', value: storageClassProvisioner },
      { label: 'Reclaim Policy', value: storageClassReclaimPolicy },
      { label: 'Volume Binding Mode', value: storageClassBindingMode },
      { label: 'Allow Volume Expansion', value: storageClassExpansion },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
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

  if (['deployments', 'statefulsets'].includes(kind)) {
    return [
      { label: 'Namespace', value: resourceNamespace },
      { label: 'Pods', value: workloadPods },
      { label: 'Replicas', value: workloadReplicas },
      { label: 'Age', value: (resource) => age(metadata(resource).creationTimestamp) },
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
  if (kind === 'namespaces') return snapshot.namespaces;
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