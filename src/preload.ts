/** Secure renderer bridge exposing the application and Kubernetes IPC APIs. */
import { contextBridge, ipcRenderer } from 'electron';

/** Resource collections addressable through the renderer's preload API. */
type ResourceKind =
  | 'nodes'
  | 'namespaces'
  | 'pods'
  | 'deployments'
  | 'daemonsets'
  | 'statefulsets'
  | 'replicasets'
  | 'jobs'
  | 'cronjobs'
  | 'services'
  | 'ingresses'
  | 'configmaps'
  | 'secrets'
  | 'pvcs'
  | 'pvs'
  | 'serviceaccounts'
  | 'clusterroles'
  | 'roles'
  | 'clusterrolebindings'
  | 'rolebindings'
  | 'storageclasses'
  | 'serviceaccounts'
  | 'clusterroles'
  | 'roles'
  | 'clusterrolebindings'
  | 'rolebindings'
  | 'events';

contextBridge.exposeInMainWorld('kubeApi', {
  /**
   * Requests kubeconfig contexts and the active selection from the main process.
   * @returns Context list, default search path, and selected context identifier.
   */
  getContexts: () => ipcRenderer.invoke('cluster:getContexts'),

  /**
   * Persists a pasted kubeconfig and selects one of its contexts.
   * @param kubeconfig - Kubeconfig YAML pasted by the user.
   * @returns Updated context list and selected context identifier.
   */
  addKubeconfig: (kubeconfig: string) =>
    ipcRenderer.invoke('cluster:addKubeconfig', kubeconfig),

  /**
   * Changes the active Kubernetes context used by subsequent requests.
   * @param contextId - Stable identifier of the context to activate.
   * @returns Updated context state from the main process.
   */
  setContext: (contextId: string) =>
    ipcRenderer.invoke('cluster:setContext', contextId),

  /**
   * Requests a cluster snapshot for a namespace and optional context.
   * @param namespace - Namespace to query, or `all` for every namespace.
   * @param contextId - Optional identifier of the context to query.
   * @returns Snapshot containing namespaces and supported resource collections.
   */
  getSnapshot: (namespace: string, contextId: string) =>
    ipcRenderer.invoke('cluster:getSnapshot', namespace, contextId),

  /**
   * Requests one resource collection without refreshing the full snapshot.
   * @param kind - Resource collection to request.
   * @param namespace - Namespace to query, or `all` for every namespace.
   * @param contextId - Optional identifier of the context to query.
   * @returns Resources in the requested collection.
   */
  getResources: (kind: ResourceKind, namespace: string, contextId: string) =>
    ipcRenderer.invoke('cluster:getResources', kind, namespace, contextId),

  /**
   * Requests one named resource from the selected namespace and context.
   * @param kind - Resource collection containing the object.
   * @param namespace - Namespace containing the object.
   * @param name - Kubernetes object name.
   * @param contextId - Optional identifier of the context to query.
   * @returns The requested Kubernetes resource.
   */
  getResource: (
    kind: ResourceKind,
    namespace: string,
    name: string,
    contextId: string,
  ) => ipcRenderer.invoke('cluster:getResource', kind, namespace, name, contextId),

  /**
   * Runs a context-bound kubectl command in the main process.
   * @param command - Command text to execute.
   * @param contextId - Optional identifier of the context to use.
   * @returns Standard output, standard error, and process exit code.
   */
  runKubectl: (command: string, contextId: string) =>
    ipcRenderer.invoke('cluster:runKubectl', command, contextId),

  /**
   * Checks availability and executable paths for the supported local CLI tools.
   * @returns Availability results and resolved paths for kubectl, Docker, and kind.
   */
  checkCliTools: () => ipcRenderer.invoke('cluster:checkCliTools'),

  /**
   * Reads persisted settings and detected executable locations.
   * @returns Kubeconfig search path, saved kubeconfigs, and CLI availability.
   */
  getSettings: () => ipcRenderer.invoke('cluster:getSettings'),

  /**
   * Updates the kubeconfig file/directory search path.
   * @param searchPath - File or directory to use during kubeconfig discovery.
   * @returns Updated settings and CLI availability.
   */
  setKubeconfigSearchPath: (searchPath: string) =>
    ipcRenderer.invoke('cluster:setKubeconfigSearchPath', searchPath),

  /**
   * Validates and replaces a saved kubeconfig document.
   * @param id - Identifier of the saved kubeconfig to update.
   * @param kubeconfig - Replacement kubeconfig YAML.
   * @returns Updated settings and saved kubeconfig collection.
   */
  updateSavedKubeconfig: (id: string, kubeconfig: string) =>
    ipcRenderer.invoke('cluster:updateSavedKubeconfig', id, kubeconfig),
});

/** Exposes native theme controls to the renderer. */
contextBridge.exposeInMainWorld('darkMode', {
  /** Toggles the operating-system native theme override and returns the new state. */
  toggle: () => ipcRenderer.invoke('dark-mode:toggle'),
  /** Resets the application theme source to the operating-system preference. */
  system: () => ipcRenderer.invoke('dark-mode:system')
});

/** Exposes application metadata and native menu events to the renderer. */
contextBridge.exposeInMainWorld('appInfo', {
  /** Requests static About-view metadata from the main process. */
  getAbout: () => ipcRenderer.invoke('app:getAbout'),
  /**
   * Subscribes to native menu requests to display the About view.
   * @param listener - Callback invoked when the native About item is selected.
   * @returns Nothing; registers the listener on the preload bridge.
   */
  onShowAbout: (listener: () => void) => {
    ipcRenderer.on('app:show-about', listener);
  },
  /**
   * Subscribes to native menu requests to display the Settings view.
   * @param listener - Callback invoked when the native Settings item is selected.
   * @returns Nothing; registers the listener on the preload bridge.
   */
  onShowSettings: (listener: () => void) => {
    ipcRenderer.on('app:show-settings', listener);
  },
});