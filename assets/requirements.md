# Requirements Document

## Introduction

k8s-cluster-browser is a cross-platform desktop application built with Tauri v2 (Rust backend) and React/TypeScript (renderer). It enables developers and operators to browse Kubernetes clusters, inspect workloads and resources, execute kubectl commands in a guarded terminal, manage multiple kubeconfigs, and operate fully offline via deterministic demo data — all without requiring a live cluster to launch.

## Glossary

- **App**: The k8s-cluster-browser desktop application.
- **Host Process**: The privileged Rust/Tauri backend process that owns filesystem access, kubeconfig parsing, Kubernetes API clients, and process execution.
- **Renderer**: The unprivileged React/TypeScript UI process responsible for presentation state, navigation, filtering, sorting, and rendering.
- **Bridge API**: The narrow, typed set of Tauri v2 commands exposed from the Host Process to the Renderer.
- **Context**: A Kubernetes context entry as defined in a kubeconfig file, identified by a stable ID composed of its source path/label and context name.
- **Context State**: The runtime object returned by Bridge API calls that contains the updated context list, selected context ID, and related metadata.
- **Kubeconfig**: A YAML configuration file containing Kubernetes cluster, user, and context definitions, conforming to the kubeconfig specification.
- **Saved Kubeconfig**: A kubeconfig YAML submitted by the user via paste, stored persistently by the App with a stable identifier.
- **Search Path**: An application-configured file or directory path used as the first priority source in kubeconfig discovery.
- **Demo Mode**: An operational mode in which the App serves deterministic fixture data from the Host Process when no live cluster or kubeconfig is available.
- **Snapshot**: A point-in-time collection of Kubernetes resource data for a given namespace and context, returned by the Bridge API.
- **Resource Inspector**: A detail panel showing resource metadata, labels, event messages (for Events kind), and YAML manifest.
- **kubectl Terminal**: The two-pane in-app terminal that accepts kubectl-prefixed commands, parses them safely, executes them directly (no shell), and displays captured output.
- **Dashboard**: The primary landing view showing cluster health summary cards and CLI tool status indicators.
- **Sidebar**: The grouped, collapsible left navigation panel listing all supported resource kinds.
- **Status Tone**: A semantic category applied to a resource's status: healthy, warning, danger, or neutral.
- **CLI Tool**: One of kubectl, Docker, or kind, whose presence is detected by the Host Process at startup.
- **Density**: A layout preference controlling spacing and information density: Cozy, Normal, or Compact.
- **Theme**: A visual preference: Light or Dark.
- **App Data Directory**: The platform-appropriate directory (e.g., `%APPDATA%` on Windows, `~/Library/Application Support` on macOS, `~/.config` on Linux) used for persisted settings.
- **kube-rs**: The Rust crate used for kubeconfig parsing, context discovery, and all Kubernetes API interactions.
- **EARS**: Easy Approach to Requirements Syntax — the pattern system used to write all requirements in this document.

---

## Requirements

### Requirement 1: Application Architecture

**User Story:** As a developer, I want the desktop app to enforce a strict privilege boundary between the backend and UI, so that the renderer cannot directly access the filesystem, execute processes, or override Kubernetes context selections.

#### Acceptance Criteria

1. THE Host Process SHALL own all filesystem access, persisted settings storage, kubeconfig parsing via kube-rs, Kubernetes API client management, CLI tool discovery, and subprocess execution.
2. THE Renderer SHALL be responsible exclusively for presentation state, navigation state, filtering, sorting, rendering, theme controls, density controls, and user interaction handling.
3. THE Bridge API SHALL expose only the commands defined in the Bridge API specification (Requirement 15) and SHALL NOT expose unrestricted filesystem, shell, or process execution APIs to the Renderer.
4. WHEN the Renderer submits user-provided text for display, THE App SHALL escape all special HTML characters (including `<`, `>`, `"`, `'`, and `&`) in user-provided text before HTML interpolation to prevent injection.
5. THE App SHALL support packaging and execution on Windows, macOS, and Linux.
6. THE Host Process SHALL store persisted settings in the platform App Data Directory as defined by the host operating system (e.g., `%APPDATA%` on Windows, `~/Library/Application Support` on macOS, `~/.config` on Linux).
7. IF the Renderer attempts to invoke a Bridge API command not defined in the Bridge API specification (Requirement 15), THEN THE Bridge API SHALL reject the call and return an error indicating an unauthorized command, without executing any action.

---

### Requirement 2: Application Startup

**User Story:** As a user, I want the app to start and show a usable Dashboard immediately, so that I am not blocked waiting for cluster connectivity or CLI tools.

#### Acceptance Criteria

1. WHEN the App starts, THE Host Process SHALL concurrently load persisted settings, detect kubectl/Docker/kind availability, and discover available Kubernetes contexts.
2. WHEN the App starts, THE Host Process SHALL load the persisted theme, density, selected context ID, kubeconfig search path, and saved pasted kubeconfigs.
3. WHEN the App starts and a previously selected context ID is found in persisted settings, THE Host Process SHALL select that context as the active context; IF the previously selected context ID is not found among the currently discovered contexts, THEN THE Host Process SHALL select the first discovered context.
4. WHEN the App starts and at least one context is available, THE Host Process SHALL begin loading the initial cluster snapshot and THE Renderer SHALL display the Dashboard in a connecting state during loading.
5. IF no kubeconfigs, contexts, or cluster connectivity are available at startup, THEN THE App SHALL fall back to Demo Mode within 3 seconds and THE Renderer SHALL display the Dashboard without hanging.
6. THE Renderer SHALL NOT hang or become unresponsive due to the absence of kubeconfigs, contexts, a live cluster, or CLI tools.
7. IF the entire startup initialization sequence does not complete within 10 seconds, THEN THE App SHALL display an interactive error state allowing the user to retry or proceed in Demo Mode.
8. IF persisted settings fail to load (e.g., corrupted or missing file), THEN THE Host Process SHALL apply default values for all settings fields and continue startup without surfacing an error to the user.

---

### Requirement 3: Kubeconfig Discovery

**User Story:** As a user, I want the app to automatically find my kubeconfig files from standard locations and custom paths, so that I can connect to clusters without manual configuration.

#### Acceptance Criteria

1. WHEN discovering kubeconfigs, THE Host Process SHALL evaluate candidate sources in this priority order: (1) the application-configured Search Path, (2) paths from the KUBECONFIG environment variable delimited by the platform path separator (`:` on Unix, `;` on Windows), (3) `~/.kube/config`, (4) `~/kubeconfig`.
2. WHERE the Search Path is configured as a directory, THE Host Process SHALL recursively inspect that directory and include all non-hidden regular files (files whose name does not begin with `.`) as kubeconfig candidates, up to a maximum directory traversal depth of 10 levels.
3. THE Host Process SHALL deduplicate candidate paths so that each resolved absolute path appears at most once in the discovered set, where deduplication is performed after symlink resolution.
4. IF a kubeconfig candidate path is missing, unreadable, or contains malformed YAML, THEN THE Host Process SHALL skip that candidate without crashing, record a warning indicating the skipped path and reason, and continue processing remaining candidates.
5. WHEN parsing kubeconfig files, THE Host Process SHALL use kube-rs for all parsing and context extraction.
6. WHEN kubeconfig discovery completes, THE Host Process SHALL emit the count of successfully parsed kubeconfig files and the count of skipped candidates.
7. IF the KUBECONFIG environment variable is set but contains no valid path entries after splitting on the platform path separator, THEN THE Host Process SHALL continue evaluation with source (3) `~/.kube/config`.

---

### Requirement 4: Context Model and Selection

**User Story:** As a user, I want to see and select Kubernetes contexts with clear identifiers, so that I always know which cluster I am working against.

#### Acceptance Criteria

1. THE Host Process SHALL represent each Context with: a stable ID (composed of source path or Saved Kubeconfig ID plus context name), context name, cluster name, user name, default namespace (defaulting to `default` when absent), source file path or Saved Kubeconfig ID, source file name or Saved Kubeconfig label, and a flag indicating whether the context is marked current in its kubeconfig.
2. THE Host Process SHALL sort the context list first by context name (case-insensitive ascending), then by source file name (case-insensitive ascending), then by source file path (case-insensitive ascending); contexts that are identical across all three sort keys SHALL be treated as duplicates and deduplicated, retaining only one entry.
3. WHEN the application initialises or no explicit selection has been made, THE Host Process SHALL set the active context to the first context whose kubeconfig-current flag is true in the sorted list, or, if no such context exists, to the first entry in the sorted list.
4. THE Renderer SHALL display the active context name in both the Sidebar Cluster group and the status bar.
5. WHEN the user selects a context from the context list, THE Bridge API SHALL return a Context State whose fields reflect the stable ID, context name, cluster name, user name, default namespace, source identifier, source label, and kubeconfig-current flag of the newly selected context.

---

### Requirement 5: Pasted Kubeconfig Management

**User Story:** As a user, I want to paste kubeconfig YAML directly into the app, so that I can add clusters that are not present on the local filesystem.

#### Acceptance Criteria

1. WHEN the user opens the Add Kubeconfig dialog and submits YAML, THE Host Process SHALL validate that the YAML parses successfully and contains at least one valid Context entry where a valid Context entry includes a non-empty name field and a non-empty cluster reference that resolves to a cluster defined within the same YAML document.
2. IF the submitted YAML fails to parse or contains no valid Context entries, THEN THE App SHALL display a validation error message within the dialog without closing the dialog, where the error message indicates whether the failure was a parse error or a missing valid context.
3. WHEN a valid kubeconfig YAML is submitted, THE Host Process SHALL persist the YAML as a Saved Kubeconfig with a stable identifier that remains unchanged across application restarts and make its contexts available for selection within 500 milliseconds of submission.
4. WHEN a Saved Kubeconfig is successfully added and no context was previously selected, THE Renderer SHALL automatically select the first context from that Saved Kubeconfig.
5. WHEN the user edits a Saved Kubeconfig YAML in Settings and saves, THE Host Process SHALL validate the replacement YAML using the same rules as criterion 1 and, if valid, replace the stored YAML while preserving the existing stable identifier of that Saved Kubeconfig.
6. IF a Saved Kubeconfig replacement YAML fails validation, THEN THE Host Process SHALL return an error indicating the reason for validation failure and leave the existing Saved Kubeconfig and its stable identifier unchanged.
7. IF the user submits YAML where the total content exceeds 1 MB, THEN THE App SHALL reject the submission and display a validation error indicating the content size limit within the dialog without closing the dialog.

---

### Requirement 6: Persistence

**User Story:** As a user, I want the app to remember my preferences and configurations across sessions, so that I do not need to reconfigure the app each time I open it.

#### Acceptance Criteria

1. THE Host Process SHALL persist the following values in the App Data Directory: selected context ID, kubeconfig Search Path, all Saved Kubeconfigs with their stable IDs, theme preference, and density preference.
2. WHEN the host application starts, THE Host Process SHALL load persisted values from the App Data Directory and apply them as the active configuration before the UI renders.
3. IF a persisted value is missing or cannot be parsed during load, THEN THE Host Process SHALL apply the default value for that field and continue loading remaining fields without surfacing an error to the user.
4. WHEN the user sets a kubeconfig Search Path, THE Host Process SHALL trim whitespace, expand `~` to the user's home directory, and store the normalized absolute path.
5. IF the user submits an empty or otherwise invalid Search Path, THEN THE Host Process SHALL reject it and return a validation error without persisting the invalid value.

---

### Requirement 7: Navigation Sidebar

**User Story:** As a user, I want a grouped sidebar listing all supported resource kinds with live counts, so that I can quickly navigate to any resource type.

#### Acceptance Criteria

1. THE Renderer SHALL display a left sidebar organized into these named groups: Cluster, Workloads, Network, Access Control, Configuration, Storage, Observability — each containing the resource kinds specified in the product specification.
2. THE Renderer SHALL display an icon and an active state indicator for each sidebar entry, where the active state indicator is visible only for the currently selected entry and no other entry simultaneously.
3. WHEN resource counts are available, THE Renderer SHALL display the count badge showing the total number of resources for that kind; WHILE counts are not yet loaded, THE Renderer SHALL hide the count badge rather than showing zero or a placeholder.
4. THE Renderer SHALL render each sidebar group as a collapsible section with an `aria-expanded` attribute set to "true" when expanded and "false" when collapsed, toggled by user interaction with the group header.
5. THE Renderer SHALL include within the Cluster group: the context selector, the Add Kubeconfig action, and the Dashboard navigation entry.
6. IF a resource count value exceeds 9,999, THE Renderer SHALL display the count badge as "9999+" rather than the exact number.
7. WHEN the user activates a sidebar entry, THE Renderer SHALL navigate to the corresponding resource list view and update the active state indicator to reflect the newly selected entry.

---

### Requirement 8: Dashboard

**User Story:** As a user, I want a Dashboard view showing cluster health at a glance and CLI tool status, so that I can quickly assess the state of my cluster without navigating to individual resource views.

#### Acceptance Criteria

1. WHEN the user navigates to the Dashboard, THE Renderer SHALL display four health summary cards: Pods Running (running count / total pod count), Nodes Ready (ready count / total node count), Workloads Ready (ready count / total count across Deployments, StatefulSets, and DaemonSets), and Warnings (count of warning or unhealthy resources).
2. WHEN the user navigates to the Dashboard, THE Renderer SHALL render each health summary card with: an icon, a semantic Status Tone, a primary value displayed as "ready/total", and a bounded progress indicator expressed as a percentage from 0 to 100.
3. IF the total count for any health summary card is zero, THEN THE Renderer SHALL display the primary value as "0/0" and render the progress indicator at 0%.
4. WHEN the user navigates to the Dashboard, THE Renderer SHALL display the following cluster controls: context selector, namespace selector (showing "All" plus each discovered namespace), resource search field, refresh action, light/dark toggle, density selector, and settings action.
5. WHEN the user navigates to the Dashboard, THE Renderer SHALL display CLI status indicators for kubectl, Docker, and kind, each showing one of: Detected, Not Detected, or Checking, with an accessible label and a tooltip displaying the status text.
6. IF a CLI tool's availability check does not complete within 5 seconds, THEN THE Renderer SHALL resolve that tool's indicator to "Not Detected".

---

### Requirement 9: Resource Views

**User Story:** As a user, I want consistent, filterable, sortable resource tables for every Kubernetes resource kind, so that I can find and inspect any resource quickly.

#### Acceptance Criteria

1. THE Renderer SHALL display a resource view for each of the following kinds: Nodes, Namespaces, Pods, Deployments, DaemonSets, StatefulSets, ReplicaSets, Jobs, CronJobs, Services, Ingresses, Service Accounts, Cluster Roles, Roles, Cluster Role Bindings, Role Bindings, ConfigMaps, Secrets, PVCs, PVs, Storage Classes, Events.
2. THE Renderer SHALL display a heading matching the Sidebar navigation label at the top of each resource view.
3. THE Renderer SHALL display a table with Name as the first column for every resource kind.
4. WHEN resource data is present in the data source, THE Renderer SHALL display at least one table row per resource returned by the data source.
5. THE Renderer SHALL use stable namespace and name identifiers for row selection so that the same resource can be reselected after a data refresh.
6. WHEN the user selects a specific namespace from the namespace selector for a namespace-scoped kind, THE Renderer SHALL display only resources whose namespace matches the selected value; WHEN the user selects "All", THE Renderer SHALL display resources across all namespaces for that kind.
7. WHEN the user types in the search field, THE Renderer SHALL, within 300 milliseconds, filter table rows using case-insensitive substring matching against at minimum the resource name and namespace fields.
8. WHEN no resources match the current filter state, THE Renderer SHALL display an explicit empty state message stating no results were found and instructing the user to adjust the namespace or search filter.
9. THE Renderer SHALL escape all resource-derived text (names, labels, messages, YAML-derived values) before rendering to prevent markup injection.
10. THE Renderer SHALL render absent or missing field values as a dash (`-`) character.
11. WHEN the user clicks a sortable column header, THE Renderer SHALL sort rows in ascending order on first click and in descending order on the next click; THE Renderer SHALL display a visible sort direction indicator on the active sort column; THE Renderer SHALL apply numeric sort for numeric columns and natural case-insensitive sort for text columns.
12. THE Renderer SHALL apply semantic Status Tones (healthy, warning, danger, neutral) to resource status indicators according to the status mappings defined for each resource kind.
13. THE Renderer SHALL display the column schemas for each resource kind as specified in the product specification table schemas.
14. IF a resource collection fetch fails, THEN THE Renderer SHALL display an error banner identifying the affected collection and keep all other resource views interactive.
15. WHEN a resource collection fetch is in progress, THE Renderer SHALL display a loading indicator for that collection in place of the table.

---

### Requirement 10: Loading and Error Handling

**User Story:** As a user, I want the app to remain usable even when cluster data is loading or unavailable, so that a slow or failed API call does not block my workflow.

#### Acceptance Criteria

1. WHEN a resource collection is being fetched, THE Renderer SHALL display a loading indicator for that collection in place of its content area, leaving all other collection areas interactive.
2. IF a resource collection fetch fails, THEN THE Renderer SHALL display an error banner identifying the failed collection, keep all other collection areas interactive, and substitute Demo Mode data for that collection.
3. IF a resource collection fetch does not complete within 30 seconds, THEN THE Renderer SHALL treat the request as failed and apply the same error banner and Demo Mode fallback as criterion 2.
4. THE Host Process SHALL eagerly load Namespaces and primary Dashboard data at application startup, and SHALL load Nodes, ReplicaSets, Jobs, CronJobs, PVs, Storage Classes, Service Accounts, and RBAC collections on demand the first time the user navigates to the corresponding view.
5. THE Bridge API SHALL support three retrieval scopes: full Snapshot, single-collection, and single-resource requests, returning an error response indicating the scope and collection name when a requested resource is unavailable.

---

### Requirement 11: Resource Inspector

**User Story:** As a user, I want to inspect a resource's full details and YAML manifest from within the app, so that I can troubleshoot issues without switching to a terminal.

#### Acceptance Criteria

1. WHEN the user selects a resource row, THE Renderer SHALL open the Resource Inspector panel displaying: kind, name, namespace (for namespaced kinds), status, age in a human-readable duration format (e.g., "5m", "2h", "3d"), and label count as a non-negative integer.
2. THE Renderer SHALL display resource labels as key-value pairs in a scrollable area with a maximum of 50 labels visible at once, and SHALL display a message indicating no labels are present when the label count is zero.
3. WHEN the selected resource is of kind Events, THE Renderer SHALL display the event message in a dedicated section within the Resource Inspector, and SHALL display a message indicating no event message is available when the event message field is absent or empty.
4. THE Renderer SHALL display the resource's YAML manifest in the Resource Inspector, including apiVersion, kind, metadata, spec, status, data, and other top-level fields present in the resource, and SHALL exclude the `metadata.managedFields` field from the rendered YAML.
5. THE Renderer SHALL apply YAML syntax highlighting in the manifest view, visually distinguishing keys, scalar values, and comments using distinct formatting, and SHALL escape all YAML-derived values before rendering to prevent injection.
6. THE Renderer SHALL provide a Copy Resource Name action and a Copy Manifest action in the Resource Inspector, each of which writes its respective content to the system clipboard and provides visual confirmation within 500ms of activation.
7. WHEN the user closes the Resource Inspector, THE Renderer SHALL return focus to the resource table and SHALL preserve the current resource list view state, including scroll position, selected namespace, and active filters.
8. IF the YAML manifest for a selected resource cannot be retrieved, THEN THE Renderer SHALL display an error message indicating the manifest is unavailable and SHALL keep the Resource Inspector panel open with all other available fields rendered.

---

### Requirement 12: kubectl Terminal

**User Story:** As a user, I want a guarded in-app terminal for running kubectl commands against the selected context, so that I can perform operations without switching to an external terminal.

#### Acceptance Criteria

1. THE Renderer SHALL display the kubectl Terminal as a two-pane layout: a command/history pane and an output pane.
2. WHEN the user submits a command prefixed with `kubectl`, `kubectl.exe`, or `k`, THE App SHALL strip the prefix before execution.
3. THE Host Process SHALL parse command input supporting quoted arguments and backslash escape sequences before constructing the argument array.
4. IF the command input is empty, contains incomplete quote sequences, contains incomplete backslash escapes, or includes `--context` or `--kubeconfig` argument overrides, THEN THE Host Process SHALL reject the command, discard the input without executing, and display an error message in the output pane indicating the reason for rejection.
5. THE Host Process SHALL execute kubectl commands by passing the parsed argument array directly to the kubectl executable without invoking a shell.
6. THE Host Process SHALL bind every kubectl execution to the currently selected context by injecting `--context <contextName>` into the argument array.
7. WHEN kubectl execution completes, THE App SHALL capture stdout, stderr, and the exit code and display all three in the output pane.
8. THE Host Process SHALL enforce a maximum output buffer of 10 MB and a timeout of 120 seconds per kubectl execution; WHEN the timeout is reached, THE Host Process SHALL terminate the subprocess and display a timeout error in the output pane.
9. THE Renderer SHALL apply syntax highlighting to the output pane content that distinguishes YAML keys, string values, numeric values, boolean values, and list indicators, and SHALL escape all output content before rendering.
10. THE Renderer SHALL maintain a command history capped at 1000 entries; WHEN a command is submitted or the history is cleared, THE Renderer SHALL scroll the history pane to the most recent entry, with a clear history action available at all times.
11. THE Renderer SHALL provide a clear current output action and an expand/collapse output pane action.
12. WHEN the user presses Tab with the command input containing only the character `k` and the cursor positioned at index 1, THE Renderer SHALL replace the input value with `kubectl`.
13. WHEN kubectl is not detected, THE Renderer SHALL disable the command input, Run action, output toggle, and clear actions, visually indicate the terminal area is unavailable by reducing its opacity to 50%, and display an overlay with kubectl installation instructions.
14. THE Renderer SHALL NOT disable the kubectl Terminal due to the absence of Docker or kind.
15. WHILE a kubectl command is executing, THE Host Process SHALL reject any additional command submission and THE Renderer SHALL indicate that an execution is in progress until the current execution completes or times out.

---

### Requirement 13: Settings View

**User Story:** As a user, I want a Settings view where I can manage kubeconfig paths and saved configs, so that I can update my cluster configuration without restarting the app.

#### Acceptance Criteria

1. THE Renderer SHALL display a Settings view containing: an editable kubeconfig Search Path field with save and cancel actions, a list of Saved Kubeconfigs each with an editable YAML textarea and a Save Kubeconfig action, and read-only detected paths for Docker, kind, and kubectl.
2. WHEN the user saves a kubeconfig Search Path that is a non-empty string representing an absolute filesystem path, THE Renderer SHALL display a success message confirming the save.
3. IF the user submits an empty or non-absolute Search Path, THEN THE Renderer SHALL display an error message, retain the user's entered value in the field, and make no change to the persisted Search Path.
4. WHEN the user activates the cancel action in Settings, THE Renderer SHALL restore the Search Path field to the last successfully saved value without persisting any changes.
5. WHEN the user saves a Search Path or updates a Saved Kubeconfig in Settings, THE Host Process SHALL refresh context discovery and reload cluster data within 5 seconds.
6. THE Renderer SHALL provide a back navigation action in Settings that returns the user to the cluster resource view.
7. WHEN a save operation completes, THE Renderer SHALL reload and display the updated persisted values in the Settings view.

---

### Requirement 14: About View and Native Menu

**User Story:** As a user, I want an About view accessible from the native application menu, so that I can find the app version and support information.

#### Acceptance Criteria

1. THE App SHALL expose an About entry in the native Help menu that opens an About view displaying: product name, version string (format: MAJOR.MINOR.PATCH), description, author name and email address, and repository URL.
2. THE App SHALL expose a Settings entry in the native application menu that opens the Settings view.
3. WHEN the Renderer completes its initial render, THE Renderer SHALL register handlers for native menu events dispatched after that point.
4. IF a native menu event is dispatched before the Renderer completes its initial render, THEN THE Renderer SHALL queue the event and process it once initial rendering is complete.
5. WHEN the user activates the back-to-cluster navigation action in the About view, THE App SHALL navigate to the Cluster view.

---

### Requirement 15: Bridge API

**User Story:** As a developer, I want a well-defined, typed command bridge between the backend and renderer, so that the security boundary is clear and the renderer cannot perform unauthorized operations.

#### Acceptance Criteria

1. THE Bridge API SHALL expose exactly the following Tauri commands: `getContexts`, `setContext`, `addKubeconfig`, `getSnapshot`, `getResources`, `getResource`, `runKubectl`, `checkCliTools`, `getSettings`, `setKubeconfigSearchPath`, `updateSavedKubeconfig`, `getAbout`.
2. THE `getContexts` command SHALL return: the default kubeconfig search path, the list of available Contexts, and the currently selected context ID.
3. THE `setContext(contextId)` command SHALL update the selected context and return a refreshed Context State.
4. THE `addKubeconfig(yaml)` command SHALL validate and persist the submitted YAML and return a refreshed Context State.
5. THE `getSnapshot(namespace, contextId?)` command SHALL return: context name, operational mode (live or demo), an optional error message, the list of discovered namespaces, and the requested resource collections.
6. THE `getResources(kind, namespace, contextId?)` command SHALL return the requested resource collection for the given kind and namespace.
7. THE `getResource(kind, namespace, name, contextId?)` command SHALL return the full resource object for the specified resource.
8. THE `runKubectl(command, contextId?)` command SHALL return stdout, stderr, and the exit code of the executed kubectl invocation.
9. THE `checkCliTools` command SHALL return for each of kubectl, Docker, and kind: availability status, a human-readable message, and the resolved executable path.
10. THE `getSettings` command SHALL return the current kubeconfig Search Path, the list of Saved Kubeconfigs, and current CLI tool availability.
11. THE `setKubeconfigSearchPath(path)` command SHALL validate, normalize, and persist the path and return updated settings.
12. THE `updateSavedKubeconfig(id, yaml)` command SHALL validate the replacement YAML, update the identified Saved Kubeconfig, and return updated settings.
13. THE `getAbout` command SHALL return product name, version, description, author name, author email, and repository URL.

---

### Requirement 16: Demo Mode

**User Story:** As a user, I want the app to operate with realistic fixture data when no cluster is available, so that I can evaluate the app and develop against it without a live Kubernetes cluster.

#### Acceptance Criteria

1. WHEN no live kubeconfig or cluster is available, THE Host Process SHALL serve deterministic fixture data for all resource kinds.
2. THE Demo Mode fixtures SHALL include resources across at least these namespaces: default, platform, payments, observability, ingress-nginx.
3. THE Demo Mode fixtures SHALL include: a control-plane node and at least one worker node with distinct roles, running and pending pods with varied readiness states and restart counts, healthy and partially ready Deployments and StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, Services, Ingresses, ConfigMaps, Secrets, PVCs, PVs, Storage Classes, Service Accounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings, and both Normal and Warning Events.
4. THE Demo Mode fixtures SHALL be stable enough to exercise label display, status tones, age formatting, manifest rendering, sorting, and all defined table column schemas.
5. THE Host Process SHALL return `"demo"` as the operational mode in Snapshot responses when serving Demo Mode data.

---

### Requirement 17: Security

**User Story:** As a developer, I want the app to enforce security controls over kubectl execution and renderer capabilities, so that the app cannot be used to escalate privileges or leak credentials.

#### Acceptance Criteria

1. THE Host Process SHALL NEVER execute kubectl through a shell interpreter; all kubectl invocations SHALL use direct process execution with a parsed argument array.
2. THE Host Process SHALL reject any kubectl command input that includes `--context` or `--kubeconfig` argument overrides and SHALL return a user-facing error.
3. IF a kubeconfig YAML fails structural or content validation, THEN THE Host Process SHALL reject it and return a user-facing error without persisting or applying the invalid kubeconfig.
4. IF a Kubernetes API call fails or returns a malformed object, THEN THE Host Process SHALL log the error internally and return a graceful error response without crashing.
5. THE Host Process SHALL NOT log kubeconfig credential values or Kubernetes Secret values.
6. THE Renderer SHALL escape all resource names, label keys, label values, event messages, YAML-derived content, and settings content before rendering.
7. THE Host Process SHALL handle absent optional fields in Kubernetes API objects without panicking or returning an error to the Renderer.

---

### Requirement 18: Theme and Density

**User Story:** As a user, I want to switch between light/dark themes and layout densities, so that I can adapt the app to my environment and preferences.

#### Acceptance Criteria

1. THE App SHALL support Light and Dark themes applied at the document level.
2. WHEN the user changes the theme, THE Renderer SHALL apply the new theme immediately and THE Host Process SHALL persist the new preference.
3. THE App SHALL support three density levels: Cozy, Normal, and Compact.
4. WHEN the user changes the density level, THE Renderer SHALL update the layout immediately and THE Host Process SHALL persist the new preference.

---

### Requirement 19: Accessibility

**User Story:** As a user, I want the app to be accessible with keyboard navigation and assistive technologies, so that I can use the app effectively regardless of input method.

#### Acceptance Criteria

1. THE Renderer SHALL provide accessible labels for all icon-only buttons, status indicators, namespace and context selectors, dialogs, live terminal output regions, and collapsible navigation groups.
2. THE Renderer SHALL display visible focus states on all interactive elements when navigated via keyboard.
3. THE Renderer SHALL display hover tooltips on icon-only controls and status indicators.

---

### Requirement 20: Unit Tests

**User Story:** As a developer, I want comprehensive unit tests covering formatting, parsing, and data-mapping logic, so that regressions in core utilities are caught before release.

#### Acceptance Criteria

1. THE test suite SHALL include unit tests verifying safe nested object lookup returning undefined for missing paths.
2. THE test suite SHALL include unit tests verifying correct formatting of nullish, empty, scalar, and array field values.
3. THE test suite SHALL include unit tests verifying stable resource identity construction for namespace/name pairs, including Event involvedObject identity and cluster-scoped resource identity (e.g., Nodes).
4. THE test suite SHALL include unit tests verifying age formatting for durations expressed in minutes, hours, and days.
5. THE test suite SHALL include unit tests verifying Pod readiness state derivation, workload readiness computation, Job lifecycle state mapping, CronJob state derivation, PV status mapping (non-Bound phases mapped to Unbound), StorageClass default field handling, memory quantity formatting, label rendering, and resource column value derivation.
6. THE test suite SHALL include unit tests verifying that each status string maps to the correct Status Tone (healthy, warning, danger, neutral).
7. THE test suite SHALL include unit tests verifying that YAML manifest rendering excludes `metadata.managedFields` and that YAML syntax highlighting escapes all markup.
8. THE test suite SHALL include unit tests verifying that kubeconfig parser accepts kubeconfig YAML with at least one valid context and rejects structurally invalid YAML.
9. THE test suite SHALL include unit tests verifying that the terminal command parser accepts `kubectl`, `kubectl.exe`, and `k` prefixes with quoted arguments, and rejects empty commands, incomplete quote sequences, `--context` overrides, and `--kubeconfig` overrides.
10. THE test suite SHALL include unit tests verifying that each Demo Mode Snapshot populates every supported resource collection with at least one entry.

---

### Requirement 21: End-to-End Tests

**User Story:** As a developer, I want end-to-end tests covering full user workflows with a mocked bridge, so that regressions in UI behavior are caught before release.

#### Acceptance Criteria

1. THE E2E test suite SHALL launch the App with a mocked Bridge API that returns no kubectl, no kubeconfig, and no live cluster, and SHALL verify the App reaches a usable initial state.
2. THE E2E test suite SHALL verify that each sidebar resource view renders the correct heading, at least one data row in demo mode, and the expected column headers.
3. THE E2E test suite SHALL verify that the Dashboard renders all four health summary cards without any resource table.
4. THE E2E test suite SHALL verify namespace filtering, case-insensitive search, refresh action, lazy loading of on-demand collections, sidebar navigation counts, column sorting, and explicit empty states.
5. THE E2E test suite SHALL verify that selecting a table row opens the Resource Inspector and that closing the inspector returns focus to the resource table.
6. THE E2E test suite SHALL verify the Copy Resource Name and Copy Manifest actions in the Resource Inspector.
7. THE E2E test suite SHALL verify: opening Settings from the toolbar and from a native-menu event, saving a kubeconfig Search Path, editing a Saved Kubeconfig, reloading persisted values after save, and adding a kubeconfig via the dialog.
8. THE E2E test suite SHALL verify that the kubectl Terminal sends the selected context, renders stdout and exit status, maintains and clears command history, clears current output, expands/collapses the output pane, and applies the `k` Tab shortcut.
9. THE E2E test suite SHALL verify that when kubectl is not detected: the command input, Run, toggle, and clear actions are disabled; the terminal is visually dimmed; and the unavailable overlay is shown; AND that the absence of Docker or kind does NOT disable the terminal.
10. THE E2E test suite SHALL verify that theme and density controls update the document-level state and layout immediately.
11. THE E2E test suite SHALL capture visual regression screenshots for: Dashboard, every resource view, Settings, the saved kubeconfigs list, the unavailable terminal state, light mode, and dark mode.

---

### Requirement 22: Release Packaging and CI/CD

**User Story:** As a developer, I want automated CI/CD that builds cross-platform installers and publishes documentation, so that releases are reproducible and documentation stays current.

#### Acceptance Criteria

1. THE CI/CD pipeline SHALL build platform-specific installer artifacts: `.dmg` for macOS, `.msi` for Windows, and `.AppImage` for Linux, using the Tauri built-in updater.
2. THE CI/CD pipeline SHALL run unit tests, run E2E tests, generate API/reference documentation from source comments, and publish the documentation site to GitHub Pages, in that order.
3. THE documentation site SHALL include application documentation, API reference documentation, and links to the unit test HTML report and the E2E test HTML report, with fallback text when a report is unavailable.
4. THE desktop release packaging pipeline SHALL be independent of the UI toolkit version.
