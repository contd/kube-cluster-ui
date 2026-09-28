/** Shared renderer, preload, and Kubernetes resource contracts for the application. */
/** Identifies the Kubernetes resource collection shown in the navigation and tables. */
export type ResourceKind =
  | 'nodes'
  | 'namespaces'
  | 'serviceaccounts'
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
  | 'clusterroles'
  | 'roles'
  | 'clusterrolebindings'
  | 'rolebindings'
  | 'events';

/** Semantic tone used to color resource statuses and dashboard indicators. */
export type StatusTone = 'healthy' | 'warning' | 'danger' | 'neutral';

/** Persisted appearance themes supported by the renderer. */
export type Theme = 'light' | 'dark';

/** Density presets controlling how much information fits in the dashboard layout. */
export type Density = 'cozy' | 'normal' | 'compact';

/** Static product metadata displayed by the About view. */
export type AboutInfo = {
  /** Product name shown in the About view. */
  productName: string;
  /** Installed application version. */
  version: string;
  /** Source repository type and URL. */
  repository: {
    /** Repository hosting service or protocol. */
    type: string;
    /** Repository address. */
    url: string;
  };
  /** Short human-readable product description. */
  description: string;
  /** Author name and optional contact email. */
  author: {
    /** Author or maintainer display name. */
    name: string;
    /** Optional author contact address. */
    email: string;
  };
};

/** Common Kubernetes metadata fields consumed by resource identity and filtering helpers. */
export type Metadata = {
  /** Kubernetes resource name. */
  name?: string;
  /** Namespace containing the resource, when namespaced. */
  namespace?: string;
  /** Server-provided creation timestamp in ISO format. */
  creationTimestamp?: string;
  /** Key/value labels attached to the resource. */
  labels?: Record<string, string>;
};

/** Flexible normalized representation of a Kubernetes resource returned to the renderer. */
export type KubeResource = {
  /** Kubernetes API version that owns the resource kind. */
  apiVersion?: string;
  /** Kubernetes kind name, such as Pod or Deployment. */
  kind?: string;
  /** Resource type or Event type, depending on the API object. */
  type?: string;
  /** Storage provisioner associated with a StorageClass. */
  provisioner?: string;
  /** Standard Kubernetes object metadata. */
  metadata?: Metadata;
  /** Resource status fields returned by the Kubernetes API. */
  status?: Record<string, unknown>;
  /** Resource specification fields returned by the Kubernetes API. */
  spec?: Record<string, unknown>;
  /** String data entries exposed by ConfigMaps and Secrets. */
  data?: Record<string, string>;
  /** Secret references attached to a ServiceAccount. */
  secrets?: unknown[];
  /** Policy rules attached to a Role or ClusterRole. */
  rules?: unknown[];
  /** Subjects attached to a RoleBinding or ClusterRoleBinding. */
  subjects?: unknown[];
  /** Referenced role identity attached to a role binding. */
  roleRef?: {
    /** Kind of referenced role. */
    kind?: string;
    /** Referenced Role or ClusterRole name. */
    name?: string;
    /** API group containing the role kind. */
    apiGroup?: string;
  };
  /** Object referenced by a Kubernetes Event. */
  involvedObject?: {
    /** Kind of the referenced object. */
    kind?: string;
    /** Name of the referenced object. */
    name?: string;
    /** Namespace of the referenced object, when namespaced. */
    namespace?: string;
  };
  /** Event reason reported by the Kubernetes API. */
  reason?: string;
  /** Human-readable event message. */
  message?: string;
  /** Number of times the event has been observed. */
  count?: number;
  /** Most recent event timestamp in ISO format. */
  lastTimestamp?: string;
};

/** Complete data payload for one dashboard refresh, whether live or demo-backed. */
export type Snapshot = {
  /** Name of the selected Kubernetes context or demo context. */
  context: string;
  /** Indicates whether the snapshot came from a live cluster or demo data. */
  mode: 'live' | 'demo';
  /** Optional reason live data could not be loaded. */
  error?: string;
  /** Namespace collection included in the snapshot. */
  namespaces: KubeResource[];
  /** Resource collections indexed by their renderer resource kind. */
  resources: Partial<Record<ResourceKind, KubeResource[]>>;
};

/** Result returned by one kubectl command executed for the selected context. */
export type KubectlResult = {
  /** Standard output produced by kubectl. */
  stdout: string;
  /** Standard error produced by kubectl. */
  stderr: string;
  /** Process exit status, where zero indicates success. */
  exitCode: number;
};

/** Availability status for one local command-line tool. */
export type CliAvailability = {
  /** Whether the executable was found and could be invoked. */
  available: boolean;
  /** User-facing availability details or failure reason. */
  message: string;
  /** Resolved executable path when the command is available. */
  path?: string;
};

/** Startup availability results for the command-line tools shown in the status bar. */
export type CliToolsAvailability = {
  /** Availability and resolved path for kubectl. */
  kubectl: CliAvailability;
  /** Availability and resolved path for Docker. */
  docker: CliAvailability;
  /** Availability and resolved path for kind. */
  kind: CliAvailability;
};

/** Pasted kubeconfig content persisted by the application. */
export type SavedKubeconfig = {
  /** Stable identifier for the saved configuration. */
  id: string;
  /** Display label, typically the context names in the configuration. */
  label: string;
  /** Complete kubeconfig YAML supplied by the user. */
  kubeconfig: string;
};

/** Editable application configuration and locally detected command paths. */
export type SettingsInfo = {
  /** Configured file or directory searched for kubeconfig files. */
  kubeconfigSearchPath: string;
  /** User-pasted kubeconfig documents stored by the application. */
  savedKubeconfigs: SavedKubeconfig[];
  /** Current local availability and executable paths for supported CLI tools. */
  cliToolsAvailability: CliToolsAvailability;
};

/** A selectable kubeconfig context together with the file and cluster identity it represents. */
export type ClusterContext = {
  /** Stable identifier used when selecting this context. */
  id: string;
  /** Context name from the kubeconfig document. */
  name: string;
  /** Cluster name referenced by the context. */
  cluster: string;
  /** User identity referenced by the context. */
  user: string;
  /** Default namespace for this context. */
  namespace: string;
  /** Source kubeconfig file path, or saved-configuration identifier. */
  filePath: string;
  /** Source kubeconfig filename or saved-configuration label. */
  fileName: string;
  /** Whether this context is marked current in its kubeconfig. */
  isCurrent: boolean;
};

/** Renderer-facing contract exposed by the Electron preload bridge for Kubernetes operations. */
export type KubeApi = {
  /**
   * Reads the available Kubernetes contexts from the configured kubeconfig
   * sources. The returned object includes the default kubeconfig path, every
   * discovered context, and the identifier of the context currently selected
   * by the application. This method does not change the active context.
   *
   * @returns The resolved search path, discovered contexts, and selected context identifier.
   */
  getContexts: () => Promise<{
    /** Resolved kubeconfig search path. */
    defaultPath: string;
    /** Contexts discovered from files and saved configurations. */
    contexts: ClusterContext[];
    /** Identifier of the currently selected context, or an empty string. */
    selectedContextId: string;
  }>;

  /**
   * Changes the context used by subsequent Kubernetes API requests.
   *
   * @param contextId - Stable identifier of the context to activate.
   * @returns The refreshed context state, including the newly selected context
   * and the kubeconfig path used by the application.
   */
  setContext: (contextId: string) => Promise<{
    /** Resolved kubeconfig search path. */
    defaultPath: string;
    /** Contexts available after applying the selection. */
    contexts: ClusterContext[];
    /** Identifier of the selected context, or an empty string. */
    selectedContextId: string;
  }>;

  /**
   * Adds or loads a kubeconfig document and makes its contexts available to
   * the application. The returned state reflects all contexts after the
   * kubeconfig has been processed and identifies the active selection.
   *
   * @param kubeconfig - Kubeconfig content supplied as a string.
   * @returns Updated context state with the newly selected saved context.
   */
  addKubeconfig: (kubeconfig: string) => Promise<{
    /** Resolved kubeconfig search path. */
    defaultPath: string;
    /** Contexts available after adding the configuration. */
    contexts: ClusterContext[];
    /** Identifier of the selected context, or an empty string. */
    selectedContextId: string;
  }>;

  /**
   * Retrieves a point-in-time snapshot of namespaces and supported resources
   * for a Kubernetes context. The snapshot may represent live cluster data or
   * demo data, and can include an error when the data source is unavailable.
   *
   * @param namespace - Namespace to query, or the application’s namespace
   *   selector value when requesting a broader view.
   * @param contextId - Optional context identifier; when omitted, the active
   *   context selected by the application is used.
  * @returns A live cluster snapshot or demo-backed snapshot with an error.
   */
  getSnapshot: (namespace: string, contextId?: string) => Promise<Snapshot>;

  /**
   * Loads one resource collection on demand without refreshing the full snapshot.
   *
   * @param kind - Resource collection to load.
   * @param namespace - Namespace to query, or `all` for every namespace.
   * @param contextId - Optional context identifier; defaults to the active context.
   * @returns Resources in the requested collection.
   */
  getResources: (
    kind: ResourceKind,
    namespace: string,
    contextId?: string,
  ) => Promise<KubeResource[]>;

  /**
   * Retrieves one named Kubernetes resource for detailed inspection.
   *
   * @param kind - Resource collection to search, such as `pods` or `services`.
   * @param namespace - Namespace containing the resource.
   * @param name - Resource name within the namespace.
   * @param contextId - Optional context identifier; when omitted, the active
   *   context selected by the application is used.
  * @returns The requested Kubernetes resource.
   */
  getResource: (
    kind: ResourceKind,
    namespace: string,
    name: string,
    contextId?: string,
  ) => Promise<KubeResource>;

  /**
   * Runs a kubectl command without a shell and binds it to the selected context.
   *
   * @param command - Command text to parse and execute.
   * @param contextId - Optional context identifier; defaults to the active context.
   * @returns Standard output, standard error, and process exit code.
   */
  runKubectl: (command: string, contextId?: string) => Promise<KubectlResult>;

  /**
   * Checks whether kubectl, Docker, and kind can be launched locally.
   *
   * @returns Availability messages and resolved executable paths for each tool.
   */
  checkCliTools: () => Promise<CliToolsAvailability>;

  /**
   * Reads the configured kubeconfig search path, saved configurations, and CLI locations.
   *
   * @returns Current application settings and local CLI detection results.
   */
  getSettings: () => Promise<SettingsInfo>;

  /**
   * Persists a kubeconfig file or directory to include in context discovery.
   *
   * @param searchPath - File or directory to prioritize during kubeconfig discovery.
   * @returns Updated settings and current CLI detection results.
   */
  setKubeconfigSearchPath: (searchPath: string) => Promise<SettingsInfo>;

  /**
   * Validates and updates one previously pasted kubeconfig.
   *
   * @param id - Identifier of the saved configuration to replace.
   * @param kubeconfig - Replacement kubeconfig YAML.
   * @returns Updated settings, including the saved configuration list.
   */
  updateSavedKubeconfig: (id: string, kubeconfig: string) => Promise<SettingsInfo>;
};

/** Presentation metadata for one grouped sidebar entry, including Dashboard or a resource view. */
export type NavItem = {
  /** Resource kind or dashboard identifier used by navigation handlers. */
  kind: ResourceKind | 'dashboard';
  /** Visible navigation label. */
  label: string;
  /** Sidebar group that contains this item. */
  group: string;
  /** Lucide icon name used for this item. */
  icon: string;
};

/** Table column definition pairing a visible heading with a resource value reader. */
export type Column = {
  /** Table heading displayed for the resource value. */
  label: string;

  /**
   * Converts one Kubernetes resource into the text displayed in this column.
   * The renderer calls this function once for each row, so implementations
   * should be side-effect-free and return a display-safe string even when the
   * resource omits optional Kubernetes fields.
   *
   * @param resource - Resource represented by the current table row.
   */
  value: (resource: KubeResource) => string;
};

/** Direction applied when sorting the active resource table column. */
export type SortDirection = 'ascending' | 'descending';

declare global {
  /** Electron preload APIs exposed to the renderer process. */
  interface Window {
    /** Kubernetes and local-settings API exposed by the preload bridge. */
    kubeApi?: KubeApi;
    /** Application metadata and native-menu event bridge. */
    appInfo?: {
      /**
       * Retrieves static application metadata used by the About dialog.
       *
       * @returns Product identity, version, repository, description, and
       *   author information.
       */
      getAbout: () => Promise<AboutInfo>;

      /**
       * Registers a listener that runs whenever the host application requests
       * that the About dialog be shown. The listener receives no event data;
       * it only signals that the dialog should be opened.
       *
       * @param listener - Callback invoked for each About-dialog request.
       */
      onShowAbout: (listener: () => void) => void;

      /**
       * Registers a listener invoked when the host application requests Settings.
       *
       * @param listener - Callback invoked when the native Settings command is selected.
       */
      onShowSettings: (listener: () => void) => void;
    };
  }
}