import { contextBridge, ipcRenderer } from 'electron';

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

contextBridge.exposeInMainWorld('kubeApi', {
  getContexts: () => ipcRenderer.invoke('cluster:getContexts'),
  setContext: (contextId: string) =>
    ipcRenderer.invoke('cluster:setContext', contextId),
  getSnapshot: (namespace: string, contextId: string) =>
    ipcRenderer.invoke('cluster:getSnapshot', namespace, contextId),
  getResource: (
    kind: ResourceKind,
    namespace: string,
    name: string,
    contextId: string,
  ) => ipcRenderer.invoke('cluster:getResource', kind, namespace, name, contextId),
});
