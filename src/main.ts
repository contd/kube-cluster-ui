import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativeImage } from "electron";
import started from 'electron-squirrel-startup';
import * as k8s from '@kubernetes/client-node';
import { updateElectronApp } from 'update-electron-app';
import packageMetadata from '../package.json';
import { parseKubectlCommand } from './kubectl-command';

// Handle updates and auto-restart the app when a new version is available.
updateElectronApp();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const defaultKubeconfigPath = '/Users/jason/apex/kubeconfig';
const settingsFileName = 'settings.json';

const resolveKubeconfigCandidates = async (): Promise<string[]> => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const envKubeconfig = process.env.KUBECONFIG || '';

  const candidatePaths = [
    ...envKubeconfig
      .split(path.delimiter)
      .map((value) => value.trim())
      .filter(Boolean),
    homeDir ? path.join(homeDir, '.kube', 'config') : '',
    homeDir ? path.join(homeDir, 'kubeconfig') : '',
    defaultKubeconfigPath,
  ].filter(Boolean);

  const uniqueCandidates = [...new Set(candidatePaths)];
  const resolvedFiles: string[] = [];

  for (const candidate of uniqueCandidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        resolvedFiles.push(candidate);
        continue;
      }

      if (stats.isDirectory()) {
        const nestedFiles = await walkFiles(candidate);
        for (const nestedFile of nestedFiles) {
          resolvedFiles.push(nestedFile);
        }
      }
    } catch {
      // Ignore missing candidates.
    }
  }

  return [...new Set(resolvedFiles)];
};

const resolveDefaultKubeconfigPath = async (): Promise<string> => {
  const candidates = await resolveKubeconfigCandidates();
  return candidates[0] || defaultKubeconfigPath;
};

const resourceMap = {
  nodes: 'nodes',
  namespaces: 'namespaces',
  pods: 'pods',
  deployments: 'deployments',
  daemonsets: 'daemonsets',
  statefulsets: 'statefulsets',
  replicasets: 'replicasets',
  jobs: 'jobs',
  cronjobs: 'cronjobs',
  services: 'services',
  ingresses: 'ingresses',
  configmaps: 'configmaps',
  secrets: 'secrets',
  pvcs: 'persistentvolumeclaims',
  pvs: 'persistentvolumes',
  storageclasses: 'storageclasses',
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
  kubeconfig?: string;
};

type SavedCluster = {
  id: string;
  kubeconfig: string;
};

type AppSettings = {
  selectedContextId?: string;
  clusters?: SavedCluster[];
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

const readContextsFromString = (id: string, kubeconfig: string): KubeContext[] => {
  try {
    const config = new k8s.KubeConfig();
    config.loadFromString(kubeconfig);
    const currentContext = config.getCurrentContext();

    return config.getContexts().map((context) => ({
      id: `${id}::${context.name}`,
      name: context.name,
      cluster: context.cluster,
      user: context.user,
      namespace: context.namespace || 'default',
      filePath: id,
      fileName: 'Saved kubeconfig',
      isCurrent: context.name === currentContext,
      kubeconfig,
    }));
  } catch {
    return [];
  }
};

const scanKubeContexts = async (): Promise<KubeContext[]> => {
  try {
    const settings = await readSettings();
    const filePaths = await resolveKubeconfigCandidates();
    const contexts = (
      await Promise.all(filePaths.map(readContextsFromFile))
    ).flat();
    const savedContexts = (settings.clusters || [])
      .flatMap((cluster) => readContextsFromString(`saved:${cluster.id}`, cluster.kubeconfig));

    return [...contexts, ...savedContexts].sort((left, right) => {
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
  if (context.kubeconfig) {
    kubeConfig.loadFromString(context.kubeconfig);
  } else {
    kubeConfig.loadFromFile(context.filePath);
  }
  kubeConfig.setCurrentContext(context.name);
  return kubeConfig;
};

type KubernetesClients = {
  core: k8s.CoreV1Api;
  apps: k8s.AppsV1Api;
  batch: k8s.BatchV1Api;
  storage: k8s.StorageV1Api;
  networking: k8s.NetworkingV1Api;
};

const createClients = (context: KubeContext): KubernetesClients => {
  const kubeConfig = createKubeConfig(context);

  return {
    core: kubeConfig.makeApiClient(k8s.CoreV1Api),
    apps: kubeConfig.makeApiClient(k8s.AppsV1Api),
    batch: kubeConfig.makeApiClient(k8s.BatchV1Api),
    storage: kubeConfig.makeApiClient(k8s.StorageV1Api),
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

    case 'namespaces':
      return responseValue(await clients.core.listNamespace({}));

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

    case 'replicasets':
      return allNamespaces
        ? responseValue(await clients.apps.listReplicaSetForAllNamespaces({}))
        : responseValue(await clients.apps.listNamespacedReplicaSet({ namespace }));

    case 'jobs':
      return allNamespaces
        ? responseValue(await clients.batch.listJobForAllNamespaces({}))
        : responseValue(await clients.batch.listNamespacedJob({ namespace }));

    case 'cronjobs':
      return allNamespaces
        ? responseValue(await clients.batch.listCronJobForAllNamespaces({}))
        : responseValue(await clients.batch.listNamespacedCronJob({ namespace }));

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

    case 'pvs':
      return responseValue(await clients.core.listPersistentVolume({}));

    case 'storageclasses':
      return responseValue(await clients.storage.listStorageClass({}));

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

    case 'namespaces':
      return responseValue(await clients.core.readNamespace({ name }));

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

    case 'replicasets':
      return responseValue(
        await clients.apps.readNamespacedReplicaSet({ name, namespace }),
      );

    case 'jobs':
      return responseValue(
        await clients.batch.readNamespacedJob({ name, namespace }),
      );

    case 'pvs':
      return responseValue(await clients.core.readPersistentVolume({ name }));

    case 'storageclasses':
      return responseValue(await clients.storage.readStorageClass({ name }));

    case 'cronjobs':
      return responseValue(
        await clients.batch.readNamespacedCronJob({ name, namespace }),
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

const executeKubectl = (args: string[]) => {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    execFile(
      'kubectl',
      args,
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 120_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(new Error(
            error.killed
              ? 'kubectl command timed out after 120 seconds.'
              : `Unable to run kubectl: ${error.message}`,
          ));
          return;
        }

        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          exitCode: error ? Number(error.code) : 0,
        });
      },
    );
  });
};

const checkCommandAvailability = (
  command: string,
  args: string[],
  label: string,
): Promise<{ available: boolean; message: string }> => {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', timeout: 10_000, windowsHide: true },
      (error) => {
        if (!error || typeof error.code === 'number') {
          resolve({ available: true, message: '' });
          return;
        }

        resolve({
          available: false,
          message: error.killed
            ? `The ${label} availability check timed out.`
            : `${label} is not available on PATH. Install it and restart the app.`,
        });
      },
    );
  });
};

const checkCliToolsAvailability = async () => {
  const [kubectl, docker, kind] = await Promise.all([
    checkCommandAvailability('kubectl', ['version', '--client'], 'kubectl'),
    checkCommandAvailability('docker', ['--version'], 'Docker'),
    checkCommandAvailability('kind', ['version'], 'kind'),
  ]);

  return { kubectl, docker, kind };
};

const registerKubernetesHandlers = () => {
  ipcMain.handle('cluster:checkCliTools', checkCliToolsAvailability);

  ipcMain.handle('cluster:getContexts', async () => {
    const resolvedKubeconfigPath = await resolveDefaultKubeconfigPath();
    const { contexts, selectedContext } = await resolveSelectedContext();

    return {
      defaultPath: resolvedKubeconfigPath,
      contexts,
      selectedContextId: selectedContext?.id || '',
    };
  });

  ipcMain.handle('cluster:addKubeconfig', async (_event, kubeconfig: string) => {
    const contexts = readContextsFromString('validation', kubeconfig);
    if (!contexts.length) {
      throw new Error('The pasted kubeconfig contains no valid contexts.');
    }

    const id = crypto.createHash('sha256').update(kubeconfig).digest('hex').slice(0, 16);
    const settings = await readSettings();
    const clusters = (settings.clusters || []).filter((cluster) => cluster.id !== id);
    clusters.push({ id, kubeconfig });
    await writeSettings({ ...settings, clusters });

    const resolvedKubeconfigPath = await resolveDefaultKubeconfigPath();
    const resolved = await resolveSelectedContext(`saved:${id}::${contexts[0].name}`);
    return {
      defaultPath: resolvedKubeconfigPath,
      contexts: resolved.contexts,
      selectedContextId: resolved.selectedContext?.id || '',
    };
  });

  ipcMain.handle(
    'cluster:setContext',
    async (_event, contextId: string) => {
      const resolvedKubeconfigPath = await resolveDefaultKubeconfigPath();
      const { contexts, selectedContext } =
        await resolveSelectedContext(contextId);

      if (selectedContext) {
        const settings = await readSettings();
        await writeSettings({ ...settings, selectedContextId: selectedContext.id });
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
        const kinds = (Object.keys(resourceMap) as ResourceKind[]).filter(
          (kind) => !['namespaces', 'replicasets', 'jobs', 'cronjobs', 'pvs', 'storageclasses'].includes(kind),
        );

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
    'cluster:getResources',
    async (_event, kind: ResourceKind, namespace = 'all', contextId = '') => {
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
      const response = await readResources(kind, namespace, clients);
      return response.items || [];
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

  ipcMain.handle(
    'cluster:runKubectl',
    async (_event, command: string, contextId = '') => {
      if (typeof command !== 'string') {
        throw new Error('A kubectl command is required.');
      }

      const commandArgs = parseKubectlCommand(command);
      const { selectedContext } = await resolveSelectedContext(contextId);
      if (!selectedContext) {
        throw new Error('No Kubernetes context is selected.');
      }

      let kubeconfigPath = selectedContext.filePath;
      let temporaryDirectory = '';

      try {
        if (selectedContext.kubeconfig) {
          temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kube-cluster-ui-'));
          kubeconfigPath = path.join(temporaryDirectory, 'config');
          await fs.writeFile(kubeconfigPath, selectedContext.kubeconfig, {
            encoding: 'utf8',
            mode: 0o600,
          });
        }

        return await executeKubectl([
          '--kubeconfig', kubeconfigPath,
          '--context', selectedContext.name,
          ...commandArgs,
        ]);
      } finally {
        if (temporaryDirectory) {
          await fs.rm(temporaryDirectory, { force: true, recursive: true }).catch((): void => undefined);
        }
      }
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

const icon = nativeImage.createFromPath(
  appIconPath(process.platform)
);

const createApplicationMenu = (mainWindow: BrowserWindow) => {
  const aboutMenuItem = () => ({
    label: `About ${packageMetadata.productName}`,
    click: () => mainWindow.webContents.send('app:show-about'),
  });
  const editMenu = {
    label: 'Edit',
    submenu: [
      { role: 'undo' as const },
      { role: 'redo' as const },
      { type: 'separator' as const },
      { role: 'cut' as const },
      { role: 'copy' as const },
      { role: 'paste' as const },
      { role: 'pasteAndMatchStyle' as const },
      { role: 'delete' as const },
      { type: 'separator' as const },
      { role: 'selectAll' as const },
    ],
  };
  const fileMenu = {
    label: 'File',
    submenu: [
      { role: 'close' as const },
      { type: 'separator' as const },
      { role: 'quit' as const },
    ],
  };
  const viewMenu = {
    label: 'View',
    submenu: [
      { role: 'reload' as const },
      { role: 'forceReload' as const },
      { type: 'separator' as const },
      { role: 'toggleDevTools' as const },
      { type: 'separator' as const },
      { role: 'resetZoom' as const },
      { role: 'zoomIn' as const },
      { role: 'zoomOut' as const },
      { type: 'separator' as const },
      { role: 'togglefullscreen' as const },
    ],
  };
  const template = process.platform === 'darwin'
    ? [
        {
          label: packageMetadata.productName,
          submenu: [
            aboutMenuItem(),
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        },
        editMenu,
        viewMenu,
        {
          label: 'Help',
          submenu: [aboutMenuItem()],
        },
      ]
    : [
        fileMenu,
        editMenu,
        viewMenu,
        {
          label: 'Help',
          submenu: [aboutMenuItem()],
        },
      ];
  const menu = Menu.buildFromTemplate(template);

  Menu.setApplicationMenu(menu);
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    minWidth: 1440,
    minHeight: 920,
    width: 1440,
    height: 920,
    title: 'Kube Cluster UI',
    backgroundColor: '#f6f7f9',
    icon: icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.maximize();

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  createApplicationMenu(mainWindow);
};

app.setName(packageMetadata.productName);

ipcMain.handle('app:getAbout', () => ({
  productName: packageMetadata.productName,
  version: packageMetadata.version,
  repository: packageMetadata.repository,
  description: packageMetadata.description,
  author: packageMetadata.author,
}));

ipcMain.handle('dark-mode:toggle', () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = 'light'
  } else {
    nativeTheme.themeSource = 'dark'
  }
  return nativeTheme.shouldUseDarkColors
})

ipcMain.handle('dark-mode:system', () => {
  nativeTheme.themeSource = 'system'
})


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
