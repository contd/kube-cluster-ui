/**
 * Installs deterministic Kubernetes and application APIs for browser tests.
 * The fixture avoids kubectl, kubeconfig files, and live-cluster dependencies.
 */
(() => {
  const creationTimestamp = '2026-09-20T12:00:00.000Z';
  /**
    * Creates standard metadata for a mocked Kubernetes object.
    *
   * @param {string} name - Object name.
   * @param {string} [namespace='default'] - Namespace, or an empty string for cluster-scoped objects.
   * @returns {object} Kubernetes metadata fixture.
   */
  const metadata = (name, namespace = 'default') => ({
    name,
    namespace,
    creationTimestamp,
    labels: { app: name },
  });
  /**
    * Creates a mocked Kubernetes resource with its metadata and supplied fields.
    *
   * @param {string} kind - Kubernetes resource kind.
   * @param {string} name - Object name.
   * @param {object} [details={}] - Additional API fields to merge into the resource.
   * @param {string} [namespace='default'] - Namespace, or an empty string for cluster-scoped objects.
   * @returns {object} Mock Kubernetes resource.
   */
  const resource = (kind, name, details = {}, namespace = 'default') => ({
    kind,
    metadata: metadata(name, namespace),
    ...details,
  });

  /** Context list returned by the mocked kubeconfig API. */
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

  /** Namespace fixtures shared by the snapshot and resource-list endpoints. */
  const namespaces = [
    resource('Namespace', 'default', { status: { phase: 'Active' } }),
    resource('Namespace', 'system', { status: { phase: 'Active' } }),
  ];

  /** Deterministic collections used by resource-view browser tests. */
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

  /** Base connected-cluster snapshot returned by the mock preload bridge. */
  const snapshot = {
    context: 'test-cluster',
    mode: 'live',
    namespaces,
    resources,
  };
  /** Collections omitted from the initial snapshot and fetched on demand. */
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

  /** Preload API mock consumed by the renderer during browser tests. */
  window.kubeApi = {
    /** @returns {Promise<object>} Available contexts and the selected context identifier. */
    getContexts: async () => ({
      defaultPath: '/tmp/playwright-kubeconfig',
      contexts: contexts.map((context) => ({
        ...context,
        isCurrent: context.id === selectedContextId,
      })),
      selectedContextId,
    }),
    /**
     * Selects a mock context and returns the refreshed context list.
     * @param {string} contextId - Context identifier to activate.
     * @returns {Promise<object>} Updated context state.
     */
    setContext: async (contextId) => {
      selectedContextId = contextId;
      return window.kubeApi.getContexts();
    },
    /**
     * Returns a cloned mock snapshot with on-demand collections omitted.
     * @param {string} _namespace - Requested namespace (unused by this fixture).
     * @param {string} [contextId] - Optional selected context identifier.
     * @returns {Promise<object>} Snapshot bound to the requested mock context.
     */
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
    /** @param {string} kind - Resource kind whose fixture collection is requested. */
    getResources: async (kind) => resources[kind] || [],
    /**
     * Finds a named fixture resource in a namespace.
     * @param {string} kind - Resource kind to search.
     * @param {string} namespace - Namespace containing the resource.
     * @param {string} name - Resource name to locate.
     * @returns {Promise<object>} Matching resource fixture.
     * @throws Error when no matching fixture exists.
     */
    getResource: async (kind, namespace, name) => {
      const match = (resources[kind] || []).find((item) =>
        item.metadata.name === name && (item.metadata.namespace || 'default') === namespace,
      );
      if (!match) {
        throw new Error('Resource not found.');
      }
      return match;
    },
    /** Adds a pasted kubeconfig fixture for Settings-view tests. */
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
    /** @returns {Promise<object>} Deterministic CLI availability and paths. */
    checkCliTools: async () => ({
      ...cliToolsAvailability,
    }),
    /** @returns {Promise<object>} Current path, saved configs, and CLI availability. */
    getSettings: async () => ({ kubeconfigSearchPath, savedKubeconfigs, cliToolsAvailability }),
    /** @param {string} searchPath - New mock kubeconfig search path. */
    setKubeconfigSearchPath: async (searchPath) => {
      kubeconfigSearchPath = searchPath;
      return { kubeconfigSearchPath, savedKubeconfigs, cliToolsAvailability };
    },
    /**
     * Replaces a saved config fixture's YAML document.
     * @param {string} id - Saved kubeconfig identifier.
     * @param {string} kubeconfig - Replacement YAML document.
     * @returns {Promise<object>} Updated mock settings.
     */
    updateSavedKubeconfig: async (id, kubeconfig) => {
      const index = savedKubeconfigs.findIndex((item) => item.id === id);
      if (index >= 0) {
        savedKubeconfigs[index] = { ...savedKubeconfigs[index], kubeconfig };
      }
      return { kubeconfigSearchPath, savedKubeconfigs, cliToolsAvailability };
    },
    runKubectl: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
  };

    /** @returns {Promise<object>} Empty successful kubectl command result. */
  /** Application information and native-menu event mock used in browser tests. */
  window.appInfo = {
    getAbout: async () => ({
  /** Application metadata fixture returned by the mocked About API. */
      productName: 'Orbita',
    /** @returns {Promise<object>} Static product details used by the About view. */
      version: '2.5.0',
      repository: { type: 'git', url: 'https://github.com/contd/orbita.git' },
      description: 'A Kubernetes cluster browser inspired by LENS.',
      author: { name: 'Orbita', email: '' },
    }),
    /** @param {Function} listener - Callback to invoke for About menu requests. */
    onShowAbout: (listener) => window.addEventListener('app:show-about', listener),
    /** @param {Function} listener - Callback to invoke for Settings menu requests. */
    onShowSettings: (listener) => window.addEventListener('app:show-settings', listener),
  };

  let selectedContextId = contexts[0].id;
})();