import { contextBridge, ipcRenderer } from 'electron';

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
  | 'storageclasses'
  | 'events';

contextBridge.exposeInMainWorld('kubeApi', {
  getContexts: () => ipcRenderer.invoke('cluster:getContexts'),
  addKubeconfig: (kubeconfig: string) =>
    ipcRenderer.invoke('cluster:addKubeconfig', kubeconfig),
  setContext: (contextId: string) =>
    ipcRenderer.invoke('cluster:setContext', contextId),
  getSnapshot: (namespace: string, contextId: string) =>
    ipcRenderer.invoke('cluster:getSnapshot', namespace, contextId),
  getResources: (kind: ResourceKind, namespace: string, contextId: string) =>
    ipcRenderer.invoke('cluster:getResources', kind, namespace, contextId),
  getResource: (
    kind: ResourceKind,
    namespace: string,
    name: string,
    contextId: string,
  ) => ipcRenderer.invoke('cluster:getResource', kind, namespace, name, contextId),
  runKubectl: (command: string, contextId: string) =>
    ipcRenderer.invoke('cluster:runKubectl', command, contextId),
  checkKubectl: () => ipcRenderer.invoke('cluster:checkKubectl'),
});

contextBridge.exposeInMainWorld('darkMode', {
  toggle: () => ipcRenderer.invoke('dark-mode:toggle'),
  system: () => ipcRenderer.invoke('dark-mode:system')
});

contextBridge.exposeInMainWorld('appInfo', {
  getAbout: () => ipcRenderer.invoke('app:getAbout'),
  onShowAbout: (listener: () => void) => {
    ipcRenderer.on('app:show-about', listener);
  },
});