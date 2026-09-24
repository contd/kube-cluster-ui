/** Identifies the Kubernetes resource collection shown in the navigation and tables. */
export type ResourceKind =
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

/** Semantic tone used to color resource statuses and dashboard indicators. */
export type StatusTone = 'healthy' | 'warning' | 'danger' | 'neutral';

/** Persisted appearance themes supported by the renderer. */
export type Theme = 'light' | 'dark';

/** Density presets controlling how much information fits in the dashboard layout. */
export type Density = 'cozy' | 'normal' | 'compact';

/** Static product metadata displayed by the About view. */
export type AboutInfo = {
  productName: string;
  version: string;
  repository: { type: string; url: string };
  description: string;
  author: { name: string; email: string };
};

/** Common Kubernetes metadata fields consumed by resource identity and filtering helpers. */
export type Metadata = {
  name?: string;
  namespace?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
};

/** Flexible normalized representation of a Kubernetes resource returned to the renderer. */
export type KubeResource = {
  apiVersion?: string;
  kind?: string;
  type?: string;
  metadata?: Metadata;
  status?: Record<string, unknown>;
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  involvedObject?: {
    kind?: string;
    name?: string;
    namespace?: string;
  };
  reason?: string;
  message?: string;
  count?: number;
  lastTimestamp?: string;
};

/** Complete data payload for one dashboard refresh, whether live or demo-backed. */
export type Snapshot = {
  context: string;
  mode: 'live' | 'demo';
  error?: string;
  namespaces: KubeResource[];
  resources: Record<ResourceKind, KubeResource[]>;
};

/** A selectable kubeconfig context together with the file and cluster identity it represents. */
export type ClusterContext = {
  id: string;
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  filePath: string;
  fileName: string;
  isCurrent: boolean;
};

/** Renderer-facing contract exposed by the Electron preload bridge for Kubernetes operations. */
export type KubeApi = {
  /**
   * Reads the available Kubernetes contexts from the configured kubeconfig
   * sources. The returned object includes the default kubeconfig path, every
   * discovered context, and the identifier of the context currently selected
   * by the application. This method does not change the active context.
   */
  getContexts: () => Promise<{
    defaultPath: string;
    contexts: ClusterContext[];
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
    defaultPath: string;
    contexts: ClusterContext[];
    selectedContextId: string;
  }>;

  /**
   * Adds or loads a kubeconfig document and makes its contexts available to
   * the application. The returned state reflects all contexts after the
   * kubeconfig has been processed and identifies the active selection.
   *
   * @param kubeconfig - Kubeconfig content supplied as a string.
   */
  addKubeconfig: (kubeconfig: string) => Promise<{
    defaultPath: string;
    contexts: ClusterContext[];
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
   */
  getSnapshot: (namespace: string, contextId?: string) => Promise<Snapshot>;

  /**
   * Retrieves one named Kubernetes resource for detailed inspection.
   *
   * @param kind - Resource collection to search, such as `pods` or `services`.
   * @param namespace - Namespace containing the resource.
   * @param name - Resource name within the namespace.
   * @param contextId - Optional context identifier; when omitted, the active
   *   context selected by the application is used.
   */
  getResource: (
    kind: ResourceKind,
    namespace: string,
    name: string,
    contextId?: string,
  ) => Promise<KubeResource>;
};

/** Presentation metadata for one grouped sidebar entry, including Dashboard or a resource view. */
export type NavItem = {
  kind: ResourceKind | 'dashboard';
  label: string;
  group: string;
  icon: string;
};

/** Table column definition pairing a visible heading with a resource value reader. */
export type Column = {
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
  interface Window {
    kubeApi?: KubeApi;
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
    };
  }
}