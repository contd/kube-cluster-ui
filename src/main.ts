import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import * as k8s from '@kubernetes/client-node';
import { updateElectronApp } from 'update-electron-app';

// Handle updates and auto-restart the app when a new version is available.
updateElectronApp();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const defaultKubeconfigPath = '/Users/jason/apex/kubeconfig';
const settingsFileName = 'settings.json';

const resolveDefaultKubeconfigPath = async (): Promise<string> => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const candidatePaths = [
    defaultKubeconfigPath,
    homeDir ? path.join(homeDir, '.kube', 'config') : '',
    homeDir ? path.join(homeDir, 'kubeconfig') : '',
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking for the first valid kubeconfig path.
    }
  }

  return homeDir ? path.join(homeDir, '.kube', 'config') : defaultKubeconfigPath;
};

const resourceMap = {
  nodes: 'nodes',
  pods: 'pods',
  deployments: 'deployments',
  daemonsets: 'daemonsets',
  statefulsets: 'statefulsets',
  services: 'services',
  ingresses: 'ingresses',
  configmaps: 'configmaps',
  secrets: 'secrets',
  pvcs: 'persistentvolumeclaims',
  events: 'events',
} as const;

type ResourceKind = keyof typeof resourceMap;

type KubeContext = {
  id: string;
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  filePath: string;
  fileName: string;
  isCurrent: boolean;
};

type AppSettings = {
  selectedContextId?: string;
};

const namespacedResources = new Set<ResourceKind>([
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

const settingsPath = () => path.join(app.getPath('userData'), settingsFileName);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const readSettings = async (): Promise<AppSettings> => {
  try {
    const contents = await fs.readFile(settingsPath(), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeSettings = async (settings: AppSettings) => {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2));
};

const walkFiles = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.name.startsWith('.')) {
        return [];
      }

      if (entry.isDirectory()) {
        return walkFiles(entryPath);
      }

      return entry.isFile() ? [entryPath] : [];
    }),
  );

  return files.flat();
};

/**
 * Read contexts through @kubernetes/client-node rather than parsing kubeconfig
 * YAML ourselves. This also means the same kubeconfig parsing logic used by
 * the Kubernetes API client is used for context discovery.
 */
const readContextsFromFile = async (filePath: string): Promise<KubeContext[]> => {
  try {
    const kubeConfig = new k8s.KubeConfig();
    kubeConfig.loadFromFile(filePath);

    const currentContext = kubeConfig.getCurrentContext();

    return kubeConfig.getContexts().map((context) => ({
      id: `${filePath}::${context.name}`,
      name: context.name,
      cluster: context.cluster,
      user: context.user,
      namespace: context.namespace || 'default',
      filePath,
      fileName: path.basename(filePath),
      isCurrent: context.name === currentContext,
    }));
  } catch {
    return [];
  }
};

const scanKubeContexts = async (): Promise<KubeContext[]> => {
  try {
    const kubeconfigPath = await resolveDefaultKubeconfigPath();

    let filePaths: string[];
    try {
      const stats = await fs.stat(kubeconfigPath);
      filePaths = stats.isFile()
        ? [kubeconfigPath]
        : stats.isDirectory()
          ? await walkFiles(kubeconfigPath)
          : [];
    } catch {
      filePaths = [];
    }

    const contexts = (
      await Promise.all(filePaths.map(readContextsFromFile))
    ).flat();

    return contexts.sort((left, right) => {
      return (
        left.name.localeCompare(right.name) ||
        left.fileName.localeCompare(right.fileName) ||
        left.filePath.localeCompare(right.filePath)
      );
    });
  } catch {
    return [];
  }
};

const resolveSelectedContext = async (
  requestedContextId?: string,
): Promise<{ contexts: KubeContext[]; selectedContext?: KubeContext }> => {
  const contexts = await scanKubeContexts();
  const settings = await readSettings();

  const selectedContext =
    contexts.find((context) => context.id === requestedContextId) ||
    contexts.find((context) => context.id === settings.selectedContextId) ||
    contexts[0];

  if (selectedContext && settings.selectedContextId !== selectedContext.id) {
    await writeSettings({
      ...settings,
      selectedContextId: selectedContext.id,
    });
  }

  return { contexts, selectedContext };
};

/**
 * Create a KubeConfig for the selected context and let client-node handle
 * authentication, TLS, exec credential plugins, proxies, etc.
 */
const createKubeConfig = (context: KubeContext): k8s.KubeConfig => {
  const kubeConfig = new k8s.KubeConfig();
  kubeConfig.loadFromFile(context.filePath);
  kubeConfig.setCurrentContext(context.name);
  return kubeConfig;
};

type KubernetesClients = {
  core: k8s.CoreV1Api;
  apps: k8s.AppsV1Api;
  networking: k8s.NetworkingV1Api;
};

const createClients = (context: KubeContext): KubernetesClients => {
  const kubeConfig = createKubeConfig(context);

  return {
    core: kubeConfig.makeApiClient(k8s.CoreV1Api),
    apps: kubeConfig.makeApiClient(k8s.AppsV1Api),
    networking: kubeConfig.makeApiClient(k8s.NetworkingV1Api),
  };
};

/**
 * client-node v2 returns Kubernetes objects directly. The helper also accepts
 * the old `{ body: ... }` shape so the code remains easy to downgrade if the
 * project is pinned to an older client-node release.
 */
const responseValue = <T>(response: T | { body: T }): T => {
  if (
    isRecord(response) &&
    'body' in response &&
    response.body !== undefined
  ) {
    return response.body as T;
  }

  return response as T;
};

const readResources = async (
  kind: ResourceKind,
  namespace: string,
  clients: KubernetesClients,
) => {
  const allNamespaces = namespace === 'all';

  switch (kind) {
    case 'nodes':
      return responseValue(await clients.core.listNode({}));

    case 'pods':
      return allNamespaces
        ? responseValue(await clients.core.listPodForAllNamespaces({}))
        : responseValue(await clients.core.listNamespacedPod({ namespace }));

    case 'deployments':
      return allNamespaces
        ? responseValue(await clients.apps.listDeploymentForAllNamespaces({}))
        : responseValue(await clients.apps.listNamespacedDeployment({ namespace }));

    case 'daemonsets':
      return allNamespaces
        ? responseValue(await clients.apps.listDaemonSetForAllNamespaces({}))
        : responseValue(await clients.apps.listNamespacedDaemonSet({ namespace }));

    case 'statefulsets':
      return allNamespaces
        ? responseValue(await clients.apps.listStatefulSetForAllNamespaces({}))
        : responseValue(await clients.apps.listNamespacedStatefulSet({ namespace }));

    case 'services':
      return allNamespaces
        ? responseValue(await clients.core.listServiceForAllNamespaces({}))
        : responseValue(await clients.core.listNamespacedService({ namespace }));

    case 'ingresses':
      return allNamespaces
        ? responseValue(await clients.networking.listIngressForAllNamespaces({}))
        : responseValue(await clients.networking.listNamespacedIngress({ namespace }));

    case 'configmaps':
      return allNamespaces
        ? responseValue(await clients.core.listConfigMapForAllNamespaces({}))
        : responseValue(await clients.core.listNamespacedConfigMap({ namespace }));

    case 'secrets':
      return allNamespaces
        ? responseValue(await clients.core.listSecretForAllNamespaces({}))
        : responseValue(await clients.core.listNamespacedSecret({ namespace }));

    case 'pvcs':
      return allNamespaces
        ? responseValue(await clients.core.listPersistentVolumeClaimForAllNamespaces({}))
        : responseValue(
            await clients.core.listNamespacedPersistentVolumeClaim({ namespace }),
          );

    case 'events':
      return allNamespaces
        ? responseValue(await clients.core.listEventForAllNamespaces({}))
        : responseValue(await clients.core.listNamespacedEvent({ namespace }));
  }
};

const readResource = async (
  kind: ResourceKind,
  namespace: string,
  name: string,
  clients: KubernetesClients,
) => {
  switch (kind) {
    case 'nodes':
      return responseValue(await clients.core.readNode({ name }));

    case 'pods':
      return responseValue(
        await clients.core.readNamespacedPod({ name, namespace }),
      );

    case 'deployments':
      return responseValue(
        await clients.apps.readNamespacedDeployment({ name, namespace }),
      );

    case 'daemonsets':
      return responseValue(
        await clients.apps.readNamespacedDaemonSet({ name, namespace }),
      );

    case 'statefulsets':
      return responseValue(
        await clients.apps.readNamespacedStatefulSet({ name, namespace }),
      );

    case 'services':
      return responseValue(
        await clients.core.readNamespacedService({ name, namespace }),
      );

    case 'ingresses':
      return responseValue(
        await clients.networking.readNamespacedIngress({ name, namespace }),
      );

    case 'configmaps':
      return responseValue(
        await clients.core.readNamespacedConfigMap({ name, namespace }),
      );

    case 'secrets':
      return responseValue(
        await clients.core.readNamespacedSecret({ name, namespace }),
      );

    case 'pvcs':
      return responseValue(
        await clients.core.readNamespacedPersistentVolumeClaim({
          name,
          namespace,
        }),
      );

    case 'events':
      return responseValue(
        await clients.core.readNamespacedEvent({ name, namespace }),
      );
  }
};

const registerKubernetesHandlers = () => {
  ipcMain.handle('cluster:getContexts', async () => {
    const resolvedKubeconfigPath = await resolveDefaultKubeconfigPath();
    const { contexts, selectedContext } = await resolveSelectedContext();

    return {
      defaultPath: resolvedKubeconfigPath,
      contexts,
      selectedContextId: selectedContext?.id || '',
    };
  });

  ipcMain.handle(
    'cluster:setContext',
    async (_event, contextId: string) => {
      const resolvedKubeconfigPath = await resolveDefaultKubeconfigPath();
      const { contexts, selectedContext } =
        await resolveSelectedContext(contextId);

      if (selectedContext) {
        await writeSettings({
          selectedContextId: selectedContext.id,
        });
      }

      return {
        defaultPath: resolvedKubeconfigPath,
        contexts,
        selectedContextId: selectedContext?.id || '',
      };
    },
  );

  ipcMain.handle(
    'cluster:getSnapshot',
    async (_event, namespace = 'all', contextId = '') => {
      try {
        const resolvedKubeconfigPath = await resolveDefaultKubeconfigPath();
        const { selectedContext } = await resolveSelectedContext(contextId);

        if (!selectedContext) {
          throw new Error(
            `No kubeconfig contexts found in ${resolvedKubeconfigPath}.`,
          );
        }

        const clients = createClients(selectedContext);
        const kinds = Object.keys(resourceMap) as ResourceKind[];

        const [namespaces, ...lists] = await Promise.all([
          responseValue(await clients.core.listNamespace({})),
          ...kinds.map((kind) =>
            readResources(kind, namespace, clients),
          ),
        ]);

        return {
          context: selectedContext.name,
          selectedContextId: selectedContext.id,
          mode: 'live',
          namespaces: namespaces.items || [],
          resources: kinds.reduce<Record<string, unknown[]>>(
            (acc, kind, index) => {
              const list = lists[index] as { items?: unknown[] };
              acc[kind] = list.items || [];
              return acc;
            },
            {},
          ),
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown Kubernetes client error.';

        const resources = (
          Object.keys(resourceMap) as ResourceKind[]
        ).reduce<Record<string, unknown[]>>((acc, kind) => {
          acc[kind] = [];
          return acc;
        }, {});

        return {
          context: 'No Kubernetes context',
          error: message,
          mode: 'demo',
          namespaces: [],
          resources,
        };
      }
    },
  );

  ipcMain.handle(
    'cluster:getResource',
    async (
      _event,
      kind: ResourceKind,
      namespace: string,
      name: string,
      contextId = '',
    ) => {
      if (!resourceMap[kind]) {
        throw new Error(`Unsupported Kubernetes resource kind: ${kind}`);
      }

      const resolvedKubeconfigPath = await resolveDefaultKubeconfigPath();
      const { selectedContext } = await resolveSelectedContext(contextId);

      if (!selectedContext) {
        throw new Error(
          `No kubeconfig contexts found in ${resolvedKubeconfigPath}.`,
        );
      }

      const clients = createClients(selectedContext);

      return readResource(kind, namespace, name, clients);
    },
  );
};

const appIconPath = (platform: NodeJS.Platform): string => {
  const basePath = app.getAppPath();

  if (platform === 'win32') {
    return path.join(basePath, 'src', 'icon.ico');
  }

  if (platform === 'darwin') {
    return path.join(basePath, 'src', 'icon.icns');
  }

  return path.join(basePath, 'src', 'icon.png');
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    minWidth: 1160,
    minHeight: 760,
    width: 1440,
    height: 920,
    title: 'Kube Cluster UI',
    backgroundColor: '#f6f7f9',
    icon: appIconPath(process.platform),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.setMenuBarVisibility(false);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
  registerKubernetesHandlers();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for application and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the dock icon
  // is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
