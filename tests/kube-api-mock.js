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

  let kubeconfigSearchPath = '/tmp/playwright-kubeconfig';
  const savedKubeconfigs = [{
    id: 'saved-config-1',
    label: 'demo-context',
    kubeconfig: 'apiVersion: v1\nkind: Config\ncontexts:\n- name: demo-context\n',
  }];
  const cliToolsAvailability = {
    kubectl: { available: true, message: '', path: '/usr/local/bin/kubectl' },
    docker: { available: true, message: '', path: '/usr/local/bin/docker' },
    kind: { available: true, message: '', path: '/usr/local/bin/kind' },
  };

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
    addKubeconfig: async (kubeconfig) => {
      savedKubeconfigs.push({
        id: `saved-config-${savedKubeconfigs.length + 1}`,
        label: 'pasted-context',
        kubeconfig,
      });
      return {
        defaultPath: '/tmp/playwright-kubeconfig',
        contexts,
        selectedContextId,
      };
    },
    checkCliTools: async () => ({
      ...cliToolsAvailability,
    }),
    getSettings: async () => ({ kubeconfigSearchPath, savedKubeconfigs, cliToolsAvailability }),
    setKubeconfigSearchPath: async (searchPath) => {
      kubeconfigSearchPath = searchPath;
      return { kubeconfigSearchPath, savedKubeconfigs, cliToolsAvailability };
    },
    updateSavedKubeconfig: async (id, kubeconfig) => {
      const index = savedKubeconfigs.findIndex((item) => item.id === id);
      if (index >= 0) {
        savedKubeconfigs[index] = { ...savedKubeconfigs[index], kubeconfig };
      }
      return { kubeconfigSearchPath, savedKubeconfigs, cliToolsAvailability };
    },
    runKubectl: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
  };

  window.appInfo = {
    getAbout: async () => ({
      productName: 'Kube Cluster UI',
      version: '2.5.0',
      repository: { type: 'git', url: 'https://github.com/contd/kube-cluster-ui.git' },
      description: 'A Kubernetes cluster browser inspired by LENS.',
      author: { name: 'Kube Cluster UI', email: '' },
    }),
    onShowAbout: (listener) => window.addEventListener('app:show-about', listener),
    onShowSettings: (listener) => window.addEventListener('app:show-settings', listener),
  };

  let selectedContextId = contexts[0].id;
})();