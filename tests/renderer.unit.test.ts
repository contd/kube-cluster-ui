import { describe, expect, it } from 'vitest';
import { parseKubectlCommand } from '../src/kubectl-command';
import {
  age,
  columnsFor,
  configMap,
  contextLabel,
  createDemoSnapshot,
  daemonset,
  escapeHtml,
  event,
  formatManifest,
  highlightYaml,
  ingress,
  kindLabel,
  metadata,
  namespace,
  node,
  nodePressure,
  objectValue,
  pod,
  podReady,
  pvc,
  resourceId,
  resourceName,
  resourceNamespace,
  secret,
  service,
  statusFor,
  statusTone,
  stringValue,
  timestamp,
  workload,
  workloadReady,
  type KubeResource,
} from '../src/renderer';

const podResource = pod('platform', 'api', 'Running', '2/2', 0, 'node-a', -2);
const pendingPod = pod('payments', 'worker', 'Pending', '0/1', 3, 'node-b', -48);

// Builds the smallest useful resource for status-focused tests, keeping those
// cases independent from the larger demo snapshot fixtures.
function resourceWithStatus(status: Record<string, unknown>): KubeResource {
  return { metadata: { name: 'resource' }, status };
}

describe('renderer pure helpers', () => {
  it.each([
    ['k get pods', ['get', 'pods']],
    ['kubectl get pods -n "blue team"', ['get', 'pods', '-n', 'blue team']],
    ['k', []],
    ['kubectl', []],
  ])('parses kubectl command aliases: %s', (command, expected) => {
    expect(parseKubectlCommand(command)).toEqual(expected);
  });

  it.each([
    '',
    '   ',
    'get pods --context prod',
    'k get pods --kubeconfig custom-config',
  ])('rejects empty commands and context overrides: %s', (command) => {
    expect(() => parseKubectlCommand(command)).toThrow();
  });

  // Existing paths should resolve to their values, while missing nested keys
  // should return undefined instead of throwing.
  it.each([
    [{ nested: { value: 1 } }, ['nested', 'value'], 1],
    [{ nested: { value: 'two' } }, ['nested', 'missing'], undefined],
  ])('objectValue returns %s', (value, path, expected) => {
    expect(objectValue(value, path)).toBe(expected);
  });

  // Scalar, array, and missing values should become predictable display text.
  it.each([
    ['hello', 'hello'],
    [undefined, '-'],
  ])('stringValue formats %s', (value, expected) => {
    expect(stringValue(value)).toBe(expected);
  });

  // Ordinary resources use metadata names; Events use their involved object.
  it.each([
    [{ metadata: { name: 'api' } }, 'api'],
    [{ metadata: { name: 'event' }, kind: 'Event', involvedObject: { name: 'pod' } }, 'pod'],
  ])('metadata and resourceName resolve names', (resource, expected) => {
    expect(metadata(resource).name).toBe(resource.metadata?.name);
    expect(resourceName(resource)).toBe(expected);
  });

  // Namespace resolution and identity generation must remain stable across
  // resources from different namespaces.
  it.each([
    [podResource, 'platform', 'platform:api'],
    [pendingPod, 'payments', 'payments:worker'],
  ])('resource identity helpers resolve %s', (resource, namespaceName, id) => {
    expect(resourceNamespace(resource)).toBe(namespaceName);
    expect(resourceId(resource)).toBe(id);
  });

  // Recent and multi-day timestamps should use compact elapsed-time labels.
  it.each([
    [new Date(Date.now() - 5 * 60 * 1000).toISOString(), '5m'],
    [new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), '3d'],
  ])('age formats recent and old timestamps', (value, expected) => {
    expect(age(value)).toBe(expected);
  });

  // Pod readiness counts ready containers and preserves the ready/total format.
  it.each([
    [podResource, '2/2'],
    [pendingPod, '0/1'],
  ])('podReady reports container readiness', (resource, expected) => {
    expect(podReady(resource)).toBe(expected);
  });

  // Workload readiness should read replica counts from status and spec fields.
  it.each([
    [workload('Deployment', 'platform', 'api', 3, 3, -1), '3/3'],
    [workload('StatefulSet', 'data', 'db', 2, 1, -1), '1/2'],
  ])('workloadReady reports replicas', (resource, expected) => {
    expect(workloadReady(resource)).toBe(expected);
  });

  // Node Ready conditions should map to the renderer's Ready/NotReady labels.
  it.each([
    [resourceWithStatus({ conditions: [{ type: 'Ready', status: 'True' }] }), 'Ready'],
    [resourceWithStatus({ conditions: [{ type: 'Ready', status: 'False' }] }), 'NotReady'],
  ])('nodePressure reports node readiness', (resource, expected) => {
    expect(nodePressure(resource)).toBe(expected);
  });

  // Resource kinds should select the correct status source, including Events.
  it.each([
    [podResource, 'pods', 'Running'],
    [{ type: 'Warning' }, 'events', 'Warning'],
  ])('statusFor returns resource status', (resource, kind, expected) => {
    expect(statusFor(resource, kind)).toBe(expected);
  });

  // Status text should map to the semantic tones used by badges and indicators.
  it.each([
    [podResource, 'pods', 'healthy'],
    [pendingPod, 'pods', 'warning'],
  ])('statusTone classifies resource status', (resource, kind, expected) => {
    expect(statusTone(resource, kind)).toBe(expected);
  });

  // Each supported resource view should expose its expected table columns.
  it.each([
    ['nodes', 6],
    ['pods', 5],
  ])('columnsFor defines columns for %s', (kind, minimum) => {
    expect(columnsFor(kind).length).toBeGreaterThanOrEqual(minimum);
  });

  // The Nodes Taints column reports cardinality rather than exposing the full
  // taint payload in a compact table cell.
  it('counts node taints', () => {
    const taintsColumn = columnsFor('nodes').find((column) => column.label === 'Taints');

    expect(taintsColumn?.value({ spec: { taints: [{ effect: 'NoSchedule' }, { effect: 'NoExecute' }] } })).toBe('2');
    expect(taintsColumn?.value({ spec: {} })).toBe('0');
  });

  // Node memory should prefer allocatable capacity and render Kubernetes
  // quantities in compact human-readable binary units.
  it('formats node memory as human-readable capacity', () => {
    const memoryColumn = columnsFor('nodes').find((column) => column.label === 'Memory');

    expect(memoryColumn?.value({ status: { allocatable: { memory: '32768000Ki' } } })).toBe('31.3 Gi');
    expect(memoryColumn?.value({ status: { capacity: { memory: '65536000Ki' } } })).toBe('62.5 Gi');
  });

  // Job lifecycle columns should expose the raw API timestamps, pod counts,
  // and deletion state returned by Kubernetes.
  it('reads Job lifecycle columns from Kubernetes results', () => {
    const columns = columnsFor('jobs');
    const startColumn = columns.find((column) => column.label === 'Start Time');
    const endColumn = columns.find((column) => column.label === 'End Time');
    const readyColumn = columns.find((column) => column.label === 'Ready');
    const succeededColumn = columns.find((column) => column.label === 'Succeded');
    const terminatingColumn = columns.find((column) => column.label === 'Terminating');
    const resource = {
      metadata: { deletionTimestamp: '2026-01-01T01:02:00Z' },
      status: {
        startTime: '2026-01-01T00:00:00Z',
        completionTime: '2026-01-01T01:02:00Z',
        ready: 1,
        succeeded: 1,
      },
    } as KubeResource;

    expect(startColumn?.value(resource)).toBe('2026-01-01T00:00:00Z');
    expect(endColumn?.value(resource)).toBe('2026-01-01T01:02:00Z');
    expect(readyColumn?.value(resource)).toBe('1');
    expect(succeededColumn?.value(resource)).toBe('1');
    expect(terminatingColumn?.value(resource)).toBe('Yes');
  });

  // CronJob columns should expose schedule configuration and controller state.
  it('reads CronJob columns from Kubernetes results', () => {
    const columns = columnsFor('cronjobs');
    const schedule = columns.find((column) => column.label === 'Schedule');
    const suspend = columns.find((column) => column.label === 'Suspend');
    const active = columns.find((column) => column.label === 'Active');
    const lastSchedule = columns.find((column) => column.label === 'Last Schedule');
    const resource = {
      spec: { schedule: '0 * * * *', suspend: true },
      status: { active: [{ name: 'job-1' }], lastScheduleTime: '2026-01-01T01:02:00Z' },
    } as KubeResource;

    expect(schedule?.value(resource)).toBe('0 * * * *');
    expect(suspend?.value(resource)).toBe('Yes');
    expect(active?.value(resource)).toBe('1');
    expect(lastSchedule?.value(resource)).toBe('2026-01-01T01:02:00Z');
  });

  // Persistent Volume columns should expose storage, claim, age, and phase.
  it('reads Persistent Volume columns from Kubernetes results', () => {
    const columns = columnsFor('pvs');
    const storageClass = columns.find((column) => column.label === 'Storage Class');
    const capacity = columns.find((column) => column.label === 'Capacity');
    const claim = columns.find((column) => column.label === 'Claim');
    const status = columns.find((column) => column.label === 'Status');
    const resource = {
      metadata: { creationTimestamp: '2026-01-01T00:00:00Z' },
      spec: { storageClassName: 'gp3', capacity: { storage: '200Gi' }, claimRef: { namespace: 'payments', name: 'ledger-data' } },
      status: { phase: 'Bound' },
    } as KubeResource;

    expect(storageClass?.value(resource)).toBe('gp3');
    expect(capacity?.value(resource)).toBe('200Gi');
    expect(claim?.value(resource)).toBe('payments/ledger-data');
    expect(status?.value(resource)).toBe('Bound');
  });

  // Namespace columns should expose label count, lifecycle phase, and age.
  it('reads Namespace columns from Kubernetes results', () => {
    const columns = columnsFor('namespaces');
    const labels = columns.find((column) => column.label === 'Labels');
    const status = columns.find((column) => column.label === 'Status');
    const resource = {
      metadata: { labels: { team: 'platform', tier: 'system' } },
      status: { phase: 'Active' },
    } as KubeResource;

    expect(labels?.value(resource)).toBe('team=platform, tier=system');
    expect(status?.value(resource)).toBe('Active');
  });

  // PV status pills use status.phase and normalize every non-Bound phase to
  // the requested Unbound display value.
  it('maps Persistent Volume phases to display status', () => {
    expect(statusFor({ status: { phase: 'Bound' } }, 'pvs')).toBe('Bound');
    expect(statusFor({ status: { phase: 'Available' } }, 'pvs')).toBe('Unbound');
  });

  // StorageClass columns should expose provisioning policy and expansion data.
  it('reads StorageClass columns from Kubernetes results', () => {
    const columns = columnsFor('storageclasses');
    const provisioner = columns.find((column) => column.label === 'Provisioner');
    const reclaimPolicy = columns.find((column) => column.label === 'Reclaim Policy');
    const bindingMode = columns.find((column) => column.label === 'Volume Binding Mode');
    const expansion = columns.find((column) => column.label === 'Allow Volume Expansion');
    const resource = {
      provisioner: 'ebs.csi.aws.com',
      spec: { reclaimPolicy: 'Delete', volumeBindingMode: 'WaitForFirstConsumer', allowVolumeExpansion: true },
    } as KubeResource;

    expect(provisioner?.value(resource)).toBe('ebs.csi.aws.com');
    expect(reclaimPolicy?.value(resource)).toBe('Delete');
    expect(bindingMode?.value(resource)).toBe('WaitForFirstConsumer');
    expect(expansion?.value(resource)).toBe('Yes');
  });

  // Markup-significant characters must be escaped before HTML interpolation.
  it.each([
    ['<script>', '&lt;script&gt;'],
    ['"quoted" & safe', '&quot;quoted&quot; &amp; safe'],
  ])('escapeHtml escapes unsafe markup', (value, expected) => {
    expect(escapeHtml(value)).toBe(expected);
  });

  // Manifests should retain useful metadata while omitting managedFields noise.
  it.each([
    [podResource, true],
    [pendingPod, true],
  ])('formatManifest emits sanitized YAML', (resource, expected) => {
    const withManagedFields = {
      ...resource,
      metadata: { ...resource.metadata, managedFields: [{ manager: 'kubectl' }] },
    } as KubeResource;
    const manifest = formatManifest(withManagedFields);
    expect(manifest.includes('metadata:')).toBe(expected);
    expect(manifest.includes('managedFields:')).toBe(false);
  });

  // YAML keys and comments should receive the syntax-highlighting CSS classes.
  it.each([
    ['name: api', 'yaml-key'],
    ['enabled: true # active', 'yaml-comment'],
  ])('highlightYaml adds %s classes', (yaml, className) => {
    expect(highlightYaml(yaml)).toContain(`class="${className}"`);
  });

  // Context labels should prefer names and fall back to the config filename.
  it.each([
    [{ name: 'prod' }, 'prod'],
    [{ name: '', fileName: 'config' }, 'config'],
  ])('contextLabel chooses a readable label', (context, expected) => {
    expect(contextLabel(context)).toBe(expected);
  });

  // Resource kinds should resolve to the human-readable navigation labels.
  it.each([
    ['pods', 'Pods'],
    ['events', 'Events'],
  ])('kindLabel formats resource kinds', (kind, expected) => {
    expect(kindLabel(kind)).toBe(expected);
  });

  // Fixture timestamps must remain parseable ISO values for age calculations.
  it.each([
    [0, true],
    [-24, true],
  ])('timestamp returns ISO values', (hours, expected) => {
    expect(Number.isNaN(Date.parse(timestamp(hours)))).toBe(!expected);
  });

  // Every supported collection should be populated in independently created
  // demo snapshots.
  it('creates two demo snapshots with complete resource collections', () => {
    const first = createDemoSnapshot();
    const second = createDemoSnapshot();
    expect(Object.keys(first.resources)).toHaveLength(16);
    expect(Object.keys(second.resources)).toHaveLength(16);
    expect(first.resources.pods.length).toBeGreaterThan(1);
    expect(second.resources.events.length).toBeGreaterThan(1);
  });

  // Namespace fixtures should carry the requested name and Namespace kind.
  it.each([
    [namespace('default', -1), 'Namespace'],
    [namespace('platform', -2), 'default'],
  ])('namespace creates valid resources', (resource, expected) => {
    expect(resource.kind).toBe('Namespace');
    expect(resource.metadata?.name).toBe(expected === 'Namespace' ? 'default' : 'platform');
  });

  // Node fixtures should preserve names for worker and control-plane roles.
  it.each([
    [node('node-a', 'worker', 'v1.30', '4', '8Gi', -1), 'node-a'],
    [node('node-b', 'control-plane', 'v1.31', '8', '16Gi', -1), 'node-b'],
  ])('node creates named resources', (resource, expected) => {
    expect(resource.kind).toBe('Node');
    expect(resource.metadata?.name).toBe(expected);
  });

  // Service fixtures should retain names across ClusterIP and LoadBalancer data.
  it.each([
    [service('default', 'api', 'ClusterIP', '10.0.0.1', '80/TCP', -1), 'api'],
    [service('prod', 'web', 'LoadBalancer', '10.0.0.2', '443/TCP', -1), 'web'],
  ])('service creates named resources', (resource, expected) => {
    expect(resource.kind).toBe('Service');
    expect(resource.metadata?.name).toBe(expected);
  });

  // Ingress fixtures should preserve names independently of class and host data.
  it.each([
    [ingress('default', 'api', 'nginx', ['api.example.com'], -1), 'api'],
    [ingress('prod', 'web', 'nginx', ['web.example.com'], -1), 'web'],
  ])('ingress creates named resources', (resource, expected) => {
    expect(resource.kind).toBe('Ingress');
    expect(resource.metadata?.name).toBe(expected);
  });

  // ConfigMap fixtures should preserve names across namespaces and key sets.
  it.each([
    [configMap('default', 'api-config', ['app.yaml'], -1), 'api-config'],
    [configMap('prod', 'web-config', ['web.yaml'], -1), 'web-config'],
  ])('configMap creates named resources', (resource, expected) => {
    expect(resource.kind).toBe('ConfigMap');
    expect(resource.metadata?.name).toBe(expected);
  });

  // Secret fixtures should preserve names for opaque and TLS secret variants.
  it.each([
    [secret('default', 'api-secret', 'Opaque', ['token'], -1), 'api-secret'],
    [secret('prod', 'tls-secret', 'kubernetes.io/tls', ['tls.crt'], -1), 'tls-secret'],
  ])('secret creates named resources', (resource, expected) => {
    expect(resource.kind).toBe('Secret');
    expect(resource.metadata?.name).toBe(expected);
  });

  // PVC fixtures should identify themselves correctly for bound and pending states.
  it.each([
    [pvc('default', 'data-0', 'Bound', '10Gi', 'standard', -1), 'data-0'],
    [pvc('prod', 'data-1', 'Pending', '20Gi', 'fast', -1), 'data-1'],
  ])('pvc creates named resources', (resource, expected) => {
    expect(resource.kind).toBe('PersistentVolumeClaim');
    expect(resource.metadata?.name).toBe(expected);
  });

  // Event fixtures should retain kind and Normal/Warning type information.
  it.each([
    [event('default', 'api', 'Normal', 'Pulled', 'ok', 1, -1), 'Normal'],
    [event('prod', 'web', 'Warning', 'Failed', 'bad', 2, -1), 'Warning'],
  ])('event creates typed resources', (resource, expected) => {
    expect(resource.kind).toBe('Event');
    expect(resource.type).toBe(expected);
  });

  // DaemonSet fixtures should preserve names and available-node counts,
  // including a partially ready set.
  it('creates two daemonset fixtures', () => {
    const first = daemonset('default', 'agent', 2, 2, -1);
    const second = daemonset('prod', 'monitor', 3, 1, -1);
    expect(first.metadata?.name).toBe('agent');
    expect(second.status?.numberAvailable).toBe(1);
  });
});
