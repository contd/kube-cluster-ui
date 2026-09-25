(() => {
  const creationTimestamp = '2026-09-20T12:00:00.000Z';
  const metadata = (name, namespace = 'default') => ({
    name,
    namespace,
    creationTimestamp,
    labels: { app: name },
  });
  const resource = (kind, name, details = {}, namespace = 'default') => ({
    kind,
    metadata: metadata(name, namespace),
    ...details,
  });

  const contexts = [{
    id: 'playwright::test-cluster',
    name: 'test-cluster',
    cluster: 'test-cluster',
    user: 'playwright',
    namespace: 'default',
    filePath: '/tmp/playwright-kubeconfig',
    fileName: 'playwright-kubeconfig',
    isCurrent: true,
  }];

  const namespaces = [
    resource('Namespace', 'default', { status: { phase: 'Active' } }),
    resource('Namespace', 'system', { status: { phase: 'Active' } }),
  ];

  const resources = {
    nodes: [resource('Node', 'test-node', {
      metadata: {
        ...metadata('test-node'),
        labels: { 'node-role.kubernetes.io/worker': '', app: 'test-node' },
      },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        capacity: { cpu: '4', memory: '8Gi' },
        nodeInfo: { kubeletVersion: 'v1.30.0' },
      },
    })],
    namespaces,
    pods: [
      resource('Pod', 'test-pod', {
        spec: { nodeName: 'test-node' },
        status: {
          phase: 'Running',
          containerStatuses: [
            { name: 'main', ready: true, restartCount: 0 },
            { name: 'sidecar', ready: true, restartCount: 0 },
          ],
        },
      }),
      resource('Pod', 'worker-pod', {
        spec: { nodeName: 'test-node' },
        status: {
          phase: 'Running',
          containerStatuses: [{ name: 'worker', ready: true, restartCount: 0 }],
        },
      }),
    ],
    deployments: [resource('Deployment', 'test-deployment', {
      spec: { replicas: 1 },
      status: { replicas: 1, readyReplicas: 1 },
    })],
    daemonsets: [resource('DaemonSet', 'test-daemonset', {
      status: {
        desiredNumberScheduled: 1,
        currentNumberScheduled: 1,
        numberReady: 1,
        numberAvailable: 1,
        updatedNumberScheduled: 1,
      },
    })],
    statefulsets: [resource('StatefulSet', 'test-statefulset', {
      spec: { replicas: 1 },
      status: { replicas: 1, readyReplicas: 1 },
    })],
    replicasets: [resource('ReplicaSet', 'test-replicaset', {
      spec: { replicas: 1 },
      status: { replicas: 1, readyReplicas: 1 },
    })],
    jobs: [resource('Job', 'test-job', {
      spec: { completions: 1 },
      status: { succeeded: 1, startTime: creationTimestamp, completionTime: creationTimestamp },
    })],
    cronjobs: [resource('CronJob', 'test-cronjob', {
      spec: { schedule: '0 * * * *', suspend: false },
      status: { active: [], lastScheduleTime: creationTimestamp },
    })],
    pvs: [resource('PersistentVolume', 'test-pv', {
      spec: {
        storageClassName: 'standard',
        capacity: { storage: '1Gi' },
        claimRef: { namespace: 'default', name: 'test-pvc' },
      },
      status: { phase: 'Bound' },
    }, '')],
    storageclasses: [resource('StorageClass', 'standard', {
      provisioner: 'kubernetes.io/no-provisioner',
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'Immediate',
      allowVolumeExpansion: true,
    }, '')],
    services: [resource('Service', 'test-service', {
      spec: { type: 'ClusterIP', clusterIP: '10.0.0.1', ports: [{ port: 80, protocol: 'TCP' }] },
    })],
    ingresses: [resource('Ingress', 'test-ingress', {
      spec: { ingressClassName: 'nginx', rules: [{ host: 'test.local' }] },
    })],
    serviceaccounts: [resource('ServiceAccount', 'test-serviceaccount', {
      secrets: [{ name: 'test-serviceaccount-token' }],
    })],
    clusterroles: [resource('ClusterRole', 'test-cluster-role', {
      rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }],
    }, '')],
    roles: [resource('Role', 'test-role', {
      rules: [{ apiGroups: [''], resources: ['configmaps'], verbs: ['get'] }],
    })],
    clusterrolebindings: [resource('ClusterRoleBinding', 'test-cluster-role-binding', {
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'view' },
      subjects: [{ kind: 'ServiceAccount', name: 'test-serviceaccount', namespace: 'default' }],
    }, '')],
    rolebindings: [resource('RoleBinding', 'test-role-binding', {
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'test-role' },
      subjects: [{ kind: 'ServiceAccount', name: 'test-serviceaccount', namespace: 'default' }],
    })],
    configmaps: [resource('ConfigMap', 'test-configmap', { data: { 'app.conf': 'enabled=true' } })],
    secrets: [resource('Secret', 'test-secret', { type: 'Opaque', data: { token: 'masked' } })],
    pvcs: [resource('PersistentVolumeClaim', 'test-pvc', {
      spec: { storageClassName: 'standard' },
      status: { phase: 'Bound', capacity: { storage: '1Gi' } },
    })],
    events: [resource('Event', 'test-event', {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Pod scheduled successfully.',
      count: 1,
      involvedObject: { kind: 'Pod', name: 'test-pod', namespace: 'default' },
    })],
  };

  const snapshot = {
    context: 'test-cluster',
    mode: 'live',
    namespaces,
    resources,
  };
  const onDemandResources = [
    'namespaces',
    'replicasets',
    'jobs',
    'cronjobs',
    'pvs',
    'storageclasses',
    'serviceaccounts',
    'clusterroles',
    'roles',
    'clusterrolebindings',
    'rolebindings',
  ];

  window.kubeApi = {
    getContexts: async () => ({
      defaultPath: '/tmp/playwright-kubeconfig',
      contexts: contexts.map((context) => ({
        ...context,
        isCurrent: context.id === selectedContextId,
      })),
      selectedContextId,
    }),
    setContext: async (contextId) => {
      selectedContextId = contextId;
      return window.kubeApi.getContexts();
    },
    getSnapshot: async (_namespace, contextId) => {
      const result = JSON.parse(JSON.stringify(snapshot));
      for (const kind of onDemandResources) {
        delete result.resources[kind];
      }
      return {
        ...result,
        context: contexts.find((context) => context.id === (contextId || selectedContextId))?.name || 'test-cluster',
      };
    },
    getResources: async (kind) => resources[kind] || [],
    getResource: async (kind, namespace, name) => {
      const match = (resources[kind] || []).find((item) =>
        item.metadata.name === name && (item.metadata.namespace || 'default') === namespace,
      );
      if (!match) {
        throw new Error('Resource not found.');
      }
      return match;
    },
    addKubeconfig: async () => ({
      defaultPath: '/tmp/playwright-kubeconfig',
      contexts,
      selectedContextId,
    }),
    checkCliTools: async () => ({
      kubectl: { available: true, message: '' },
      docker: { available: true, message: '' },
      kind: { available: true, message: '' },
    }),
    runKubectl: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
  };

  let selectedContextId = contexts[0].id;
})();