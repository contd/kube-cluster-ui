# Implementation Plan: k8s-cluster-browser

## Overview

Full implementation of a cross-platform Tauri v2 desktop app for browsing Kubernetes clusters. The plan proceeds in dependency order: project scaffolding → Rust backend modules → TypeScript types and bridge adapter → Zustand stores and React Query hooks → UI shell and navigation → resource views → tests → CI/CD and documentation.

Stack: Tauri v2 (Rust), React 18 + TypeScript 5, kube-rs, Zustand, TanStack Query v5, shadcn/ui (Radix UI + Tailwind CSS), Vitest + fast-check, Playwright, proptest, GitHub Actions.

---

## Tasks

- [x] 1. Project scaffolding
  - [x] 1.1 Initialise Tauri v2 project with React + TypeScript renderer
    - Run `pnpm create tauri-app` with React + TypeScript template
    - Configure `src-tauri/tauri.conf.json`: app identifier, window title, min dimensions, updater
    - Add `pnpm` workspace and `package.json` scripts: `dev`, `build`, `preview`, `tauri`
    - _Requirements: 1.5, 22.1_

  - [x] 1.2 Configure Tailwind CSS and shadcn/ui
    - Install and configure Tailwind CSS v3 with PostCSS
    - Set `darkMode: ['selector', '[data-theme="dark"]']` in `tailwind.config.ts`
    - Initialise shadcn/ui (`pnpm dlx shadcn-ui@latest init`) with neutral base colour
    - Add `data-density` Tailwind variants: cozy (`p-4 text-base`), normal (`p-2 text-sm`), compact (`p-1 text-xs`)
    - _Requirements: 18.1, 18.3_

  - [x] 1.3 Configure Tauri v2 security capability file
    - Create `src-tauri/capabilities/bridge.json` whitelisting exactly the 13 defined command names
    - Remove default `fs`, `shell`, `process`, and `http` plugin permissions from the renderer
    - Add `tauri-plugin-clipboard-manager` and `tauri-plugin-store` to `Cargo.toml` and capability
    - _Requirements: 1.1, 1.3, 1.7, 15.1_

  - [x] 1.4 Set up Vitest and Playwright test infrastructure
    - Install Vitest, `@vitest/coverage-v8`, `fast-check`, and `@testing-library/react`
    - Configure `vite.config.ts` with Vitest settings and HTML reporter
    - Install Playwright and `@playwright/test`; create `playwright.config.ts` targeting the Tauri WebView
    - Add test scripts to `package.json`: `test`, `test:unit`, `test:e2e`
    - _Requirements: 20.1, 21.1_

- [ ] 2. Rust backend — core data types and settings store
  - [x] 2.1 Define shared Rust data types
    - Create `src-tauri/src/types.rs` with: `KubeContext`, `ContextState`, `ResourceKind` enum (all 22 kinds), `OperationalMode`, `BridgeError`, `KubectlError`, `CliToolStatus`, `SavedKubeconfig`, `AppSettings`, `Theme`, `Density`
    - Derive `Serialize`, `Deserialize`, `Clone`, `Debug` for all types
    - Implement `Default` for `Theme` (Dark), `Density` (Normal), `AppSettings`
    - _Requirements: 4.1, 6.1, 15.1_

  - [-] 2.2 Implement `settings_store` module
    - Create `src-tauri/src/settings_store/mod.rs`
    - Implement `load() -> AppSettings` using `tauri-plugin-store` with per-field default fallback on missing or failed-to-deserialize fields
    - Implement `save(settings: &AppSettings) -> Result<()>`
    - Implement `normalize_search_path(raw: &str) -> Result<PathBuf>`: trim, `shellexpand::tilde`, `canonicalize`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 2.3 Write proptest for settings serialization round-trip (Property 12)
    - **Property 12: Settings Serialization Round-Trip**
    - **Validates: Requirements 6.1**
    - For any valid `AppSettings`, serialize → deserialize must produce an equivalent value

  - [ ] 2.4 Write proptest for search path normalization (Property 13)
    - **Property 13: Search Path Normalization**
    - **Validates: Requirements 6.4**
    - For any non-empty path with leading/trailing whitespace and/or `~` prefix, stored path equals trimmed, expanded, canonicalized absolute path

- [ ] 3. Rust backend — kubeconfig discovery and context manager
  - [-] 3.1 Implement `kubeconfig_discovery` module
    - Create `src-tauri/src/kubeconfig_discovery/mod.rs` with `DiscoveryConfig`, `DiscoveryResult`, `ParsedKubeconfig`, `DiscoveryWarning` structs
    - Implement priority-ordered candidate collection: search_path → KUBECONFIG env → `~/.kube/config` → `~/kubeconfig`
    - Implement `walk_dir(dir, depth, max_depth)`: skip hidden files, cap at depth 10
    - Resolve all candidates to absolute paths after symlink expansion; deduplicate by resolved path (first occurrence wins)
    - Parse each candidate via `kube_rs::config::Kubeconfig::read_from`; on error record `DiscoveryWarning`, increment `skipped_count`, continue
    - Emit `parsed_count` and `skipped_count` on completion
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ] 3.2 Write proptest for kubeconfig path deduplication (Property 5)
    - **Property 5: Kubeconfig Path Deduplication**
    - **Validates: Requirements 3.3**
    - For any list of candidate paths including duplicates and symlinks, resolved set contains each path at most once

  - [ ] 3.3 Write proptest for malformed kubeconfig skipping (Property 6)
    - **Property 6: Malformed Kubeconfig Skipping**
    - **Validates: Requirements 3.4**
    - For any mix of valid and invalid paths, result includes only parsed kubeconfigs, records warnings for skipped paths, does not crash

  - [ ] 3.4 Write proptest for discovery priority order (Property 26)
    - **Property 26: Search Path Priority Order**
    - **Validates: Requirements 3.1**
    - search_path sources appear before KUBECONFIG before `~/.kube/config` before `~/kubeconfig`

  - [ ] 3.5 Write proptest for directory traversal depth limit (Property 27)
    - **Property 27: Directory Traversal Depth Limit**
    - **Validates: Requirements 3.2**
    - Files at depth ≤ 10 are included; files at depth > 10 and hidden files are excluded

  - [~] 3.6 Implement `context_manager` module
    - Create `src-tauri/src/context_manager/mod.rs`
    - Implement stable ID generation: `base64url(sha256("{source_path}::{context_name}"))`, using saved kubeconfig UUID in place of source_path for pasted configs
    - Implement `build_context_state(result: DiscoveryResult, persisted_id: Option<String>) -> ContextState`
    - Sort by `(name.to_lowercase(), source_label.to_lowercase(), source_path.to_lowercase())`; deduplicate entries equal across all three keys
    - Apply default selection: persisted `selected_id` if found → first `is_current == true` → first entry
    - Default `namespace` to `"default"` when absent in kubeconfig
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 3.7 Write proptest for context sort and deduplication (Property 8)
    - **Property 8: Context List Sort and Deduplication**
    - **Validates: Requirements 4.2**
    - Sorted output ordered by `(name, sourceLabel, sourcePath)` ascending; equal entries appear exactly once

  - [ ] 3.8 Write proptest for default context selection (Property 3)
    - **Property 3: Default Context Selection**
    - **Validates: Requirements 2.3, 4.3**
    - Active context follows: persisted ID match → first isCurrent → first entry

  - [ ] 3.9 Write proptest for context object completeness (Property 7)
    - **Property 7: Context Object Completeness**
    - **Validates: Requirements 4.1**
    - Every KubeContext has non-empty id, name, clusterName, userName, namespace, sourcePath, sourceLabel, and boolean isCurrent

- [ ] 4. Rust backend — Kubernetes client, CLI detector, snapshot service
  - [~] 4.1 Implement `k8s_client` module
    - Create `src-tauri/src/k8s_client/mod.rs` with `K8sClientManager` struct (`Arc<Mutex<HashMap<String, Arc<kube::Client>>>>`)
    - Implement `get_or_create(ctx: &KubeContext) -> Result<Arc<kube::Client>>` using `kube::Config::from_kubeconfig`
    - Implement `evict(context_id)` and `evict_all()`
    - Surface connection failures as `BridgeError::ClusterUnreachable`
    - _Requirements: 1.1_

  - [-] 4.2 Implement `cli_detector` module
    - Create `src-tauri/src/cli_detector/mod.rs` with `CliToolStatus` struct
    - Implement `detect_all() -> Vec<CliToolStatus>` using `tokio::join!` for concurrent detection
    - Run `kubectl version --client`, `docker version`, `kind version` each with a 5-second `tokio::time::timeout`
    - Report `available: false` for any tool that times out or fails
    - _Requirements: 8.5, 8.6_

  - [-] 4.3 Implement `demo_fixtures` module
    - Create `src-tauri/src/demo_fixtures/mod.rs`
    - Define deterministic `serde_json::Value` fixtures for all 22 resource kinds across namespaces: `default`, `platform`, `payments`, `observability`, `ingress-nginx`
    - Include the coverage specified in the design: 1 control-plane + 2 worker nodes, 15+ pods with varied states, 8 deployments, 3 DaemonSets, 3 StatefulSets, 6 ReplicaSets, 4 Jobs, 3 CronJobs, 6 Services, 3 Ingresses, 4 ServiceAccounts, 3 ClusterRoles, 4 Roles, 3 ClusterRoleBindings, 4 RoleBindings, 6 ConfigMaps, 5 Secrets, 5 PVCs, 6 PVs, 2 StorageClasses, 10 Events
    - All `creationTimestamp` values as ISO 8601 strings at fixed offsets relative to `2024-01-15T00:00:00Z`
    - Implement `get_demo_snapshot(ns: Option<&str>) -> SnapshotResponse` and `get_demo_collection(kind: ResourceKind, ns: Option<&str>) -> ResourceCollection`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [ ] 4.4 Write unit tests for demo fixtures coverage (Requirement 20.10)
    - Verify every supported resource collection contains at least one entry
    - **Validates: Requirements 16.3, 20.10**

  - [~] 4.5 Implement `snapshot_service` module
    - Create `src-tauri/src/snapshot_service/mod.rs` with `SnapshotRequest`, `SnapshotScope`, `SnapshotResponse`, `ResourceCollection` structs
    - Implement `fetch(req: SnapshotRequest, client_mgr: &K8sClientManager, demo: &DemoFixtures) -> SnapshotResponse`
    - Each collection fetch runs with a 30-second `tokio::time::timeout`; on failure or timeout substitute demo data and set `collection.error`
    - Set top-level `mode` to `"live"` if any collection succeeded, `"demo"` if all failed
    - Fall back to Demo Mode within 3 seconds at startup if no cluster is reachable
    - _Requirements: 2.4, 2.5, 10.1, 10.2, 10.3, 10.4, 10.5, 16.1_

- [ ] 5. Rust backend — kubectl executor and kubeconfig validator
  - [~] 5.1 Implement `kubectl_executor` module
    - Create `src-tauri/src/kubectl_executor/mod.rs` with `KubectlCommand`, `KubectlResult`, `KubectlError` types
    - Implement argument parser: strip `kubectl`/`kubectl.exe`/`k` prefix (case-insensitive), tokenize with quoted-string and backslash-escape support
    - Reject: empty input after strip, unclosed quotes, incomplete trailing `\`, any `--context` or `--kubeconfig` token
    - Inject `--context <contextName>` as first two tokens after validation
    - Execute via `std::process::Command::new("kubectl").args([...])` — never through a shell
    - Cap stdout + stderr each at 5 MB; enforce 120-second timeout via `tokio::time::timeout`; terminate subprocess on timeout
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 17.1, 17.2_

  - [ ] 5.2 Write proptest for kubectl parser — valid input (Property 20)
    - **Property 20: kubectl Command Parser — Valid Input Acceptance**
    - **Validates: Requirements 12.3, 20.9**
    - Any command with valid prefix, no unclosed quotes, no forbidden flags → returns parsed args + injected context

  - [ ] 5.3 Write proptest for kubectl parser — rejection (Property 21)
    - **Property 21: kubectl Command Parser — Rejection**
    - **Validates: Requirements 12.4, 17.1, 17.2, 20.9**
    - Empty after strip, unclosed quote, incomplete `\`, `--context` or `--kubeconfig` → returns error, no arg array

  - [~] 5.4 Implement kubeconfig YAML validator
    - Create `src-tauri/src/kubeconfig_validator.rs`
    - Validate: YAML parses successfully AND contains ≥ 1 context entry with non-empty `name` AND non-empty cluster reference resolving to a cluster defined in the same document
    - Return distinct error variants: `ParseError` vs `NoValidContext`
    - Enforce 1 MB size limit (return `ValidationError::TooLarge` if exceeded)
    - _Requirements: 5.1, 5.2, 5.7, 17.3_

  - [ ] 5.5 Write proptest for kubeconfig YAML validation (Property 10)
    - **Property 10: Kubeconfig YAML Validation**
    - **Validates: Requirements 5.1, 17.3, 20.8**
    - Accept iff parses + ≥ 1 valid context; all others rejected with specific error

- [ ] 6. Rust backend — bridge command handlers and Tauri wiring
  - [~] 6.1 Implement bridge command handlers
    - Create `src-tauri/src/bridge_handlers/mod.rs` with all 13 `#[tauri::command]` async functions
    - Implement: `get_contexts`, `set_context`, `add_kubeconfig`, `get_snapshot`, `get_resources`, `get_resource`, `run_kubectl`, `check_cli_tools`, `get_settings`, `set_kubeconfig_search_path`, `update_saved_kubeconfig`, `get_about`
    - Each handler deserializes typed arguments, delegates to the appropriate backend module, returns `Result<T, BridgeError>` serialized as JSON `{ error: { kind, message } }` on failure
    - Implement `get_about` returning product name, version (`MAJOR.MINOR.PATCH` from `Cargo.toml`), description, author name, author email, repository URL
    - _Requirements: 15.1–15.13_

  - [~] 6.2 Wire Tauri application entry point
    - Update `src-tauri/src/main.rs`: initialise `AppState` (wrapping all backend modules behind `Arc`), register all 13 command handlers via `tauri::Builder::invoke_handler`, set up `tauri-plugin-store` and `tauri-plugin-clipboard-manager`
    - Implement concurrent startup: spawn `settings_store.load()`, `cli_detector.detect_all()`, and `kubeconfig_discovery.run()` concurrently via `tokio::join!`
    - Apply persisted theme, density, selected context, and saved kubeconfigs before emitting initial state to renderer
    - If startup initialization does not complete within 10 seconds, emit an error state event allowing retry or Demo Mode entry
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

  - [~] 6.3 Implement credential non-logging and security guards
    - Add `redact!()` macro pattern to `kubeconfig_discovery` (log paths/names only, never cert data or tokens), `k8s_client` (no request headers or error bodies with credentials), `snapshot_service` (no Secret data values), `settings_store` (no `SavedKubeconfig.yaml` content)
    - Implement `BridgeError::Internal` catch-all at command boundary: log to `stderr`, return generic message to UI, do not panic
    - Implement absent-optional-field safety in `snapshot_service` and `bridge_handlers`: all Option fields handled without unwrap/panic
    - _Requirements: 17.4, 17.5, 17.7_

- [ ] 7. TypeScript — shared types, bridge adapter, and utility functions
  - [ ] 7.1 Define shared TypeScript types
    - Create `src/types/index.ts` with all interfaces from the design: `KubeContext`, `ContextState`, `KubeResource`, `ResourceCollection`, `SnapshotResponse`, `CliToolStatus`, `SavedKubeconfig`, `AppSettings`, `KubectlResult`, `AboutInfo`, `EventFields`, `SortState`, `StatusTone`
    - Export `ResourceKind` as a `const` enum covering all 22 kinds
    - _Requirements: 4.1, 9.1, 15.1_

  - [~] 7.2 Implement bridge adapter
    - Create `src/bridge/adapter.ts` wrapping all 13 `invoke` calls with typed signatures
    - Map Tauri `{ error: { kind, message } }` responses to typed `BridgeError` JS errors; set `noRetry = true` on `ClusterUnreachable` errors
    - _Requirements: 15.1–15.13_

  - [~] 7.3 Implement utility functions
    - Create `src/utils/escapeHtml.ts`: `escapeHtml(raw: string): string` — replaces `&`, `<`, `>`, `"`, `'`
    - Create `src/utils/formatAge.ts`: `formatAge(creationTimestamp: string): string` — `< 3600s → Xm`, `< 86400s → Xh`, `≥ 86400s → Xd`
    - Create `src/utils/statusTone.ts`: `statusTone(kind, status): StatusTone` implementing the full mapping table from the design
    - Create `src/utils/formatCount.ts`: `formatCount(n: number): string` — returns `"9999+"` when `n > 9999`, else `String(n)`
    - Create `src/utils/fieldValue.ts`: `fieldValue(val: unknown): string` — returns `"-"` for `null`, `undefined`, or absent fields; formats arrays and scalars
    - Create `src/utils/yamlRenderer.ts`: deep-clone resource, delete `metadata.managedFields`, serialize with `js-yaml`, apply token-based syntax highlighting, pass all interpolated text through `escapeHtml`
    - Create `src/utils/resourceIdentity.ts`: `resourceId(item: KubeResource): string` — `"${namespace ?? ''}/${name}"`
    - _Requirements: 1.4, 9.9, 9.10, 11.4, 11.5, 17.6, 20.1–20.7_

- [ ] 8. TypeScript — Vitest unit tests for utilities
  - [ ] 8.1 Write property test for HTML escaping (Property 1)
    - **Property 1: HTML Special Character Escaping**
    - **Validates: Requirements 1.4, 9.9, 17.6**
    - For any string containing `<`, `>`, `&`, `"`, or `'`, output of `escapeHtml` contains none of those characters in unescaped form

  - [ ] 8.2 Write property test for age formatting (Property 23)
    - **Property 23: Age Format Validity**
    - **Validates: Requirements 11.1, 20.4**
    - For any non-negative duration, `formatAge` returns string matching `/^\d+(m|h|d)$/` with correct suffix boundary

  - [ ] 8.3 Write property test for status tone completeness (Property 24)
    - **Property 24: Status Tone Completeness**
    - **Validates: Requirements 9.12, 20.6**
    - For any `(kind, statusString)` pair, `statusTone` returns one of `'healthy' | 'warning' | 'danger' | 'neutral'`; known strings map to defined values

  - [ ] 8.4 Write property test for count display cap (Property 15)
    - **Property 15: Resource Count Display Cap**
    - **Validates: Requirements 7.6**
    - `formatCount(n)` returns `String(n)` when `n ≤ 9999` and `"9999+"` when `n > 9999`

  - [ ] 8.5 Write property test for missing field dash rendering (Property 18)
    - **Property 18: Missing Field Dash Rendering**
    - **Validates: Requirements 9.10**
    - For any resource with null/undefined/absent fields, `fieldValue` returns `"-"` and never `"null"`, `"undefined"`, or empty string

  - [ ] 8.6 Write property test for YAML manifest excluding managedFields (Property 25)
    - **Property 25: YAML Manifest Excludes managedFields**
    - **Validates: Requirements 11.4, 20.7**
    - For any resource with `metadata.managedFields`, `renderManifest` output does not contain the string `"managedFields"`

  - [ ] 8.7 Write property test for resource identity (Requirement 20.3)
    - **Validates: Requirements 20.3**
    - Stable identity for namespace/name pairs, Event involvedObject identity, cluster-scoped resource identity (Nodes)

- [ ] 9. TypeScript — Zustand stores and React Query hooks
  - [~] 9.1 Implement `appStore` Zustand slice
    - Create `src/store/appStore.ts` with immer middleware
    - Implement all slice fields and actions: contexts, selectedContextId, defaultSearchPath, mode, theme, density, cliTools, namespaces, selectedNamespace, settings
    - Apply theme as `data-theme` on `<html>` and density as `data-density` on `<body>` in theme/density setters
    - _Requirements: 4.4, 18.1, 18.3_

  - [~] 9.2 Implement `resourceStore` Zustand slice
    - Create `src/store/resourceStore.ts` with immer middleware
    - Implement: `collections`, `setCollection`, `searchQuery`, `setSearchQuery`, `sortState`, `setSortState`, `selectedResource`, `setSelectedResource`, `inspectorOpen`, `setInspectorOpen`
    - _Requirements: 9.5, 9.7_

  - [ ] 9.3 Write unit tests for appStore theme/density state (Requirement 20.5)
    - Verify theme and density state transitions; document-level attribute updates
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4**

  - [ ] 9.4 Write property test for command history cap (Property 22)
    - **Property 22: Command History Cap**
    - **Validates: Requirements 12.10**
    - For any sequence of `n > 1000` commands, history length never exceeds 1000; retained entries are the 1000 most recent

  - [~] 9.5 Implement React Query configuration and bridge hooks
    - Create `src/hooks/useContexts.ts`, `useSnapshot.ts`, `useResources.ts`, `useResource.ts`, `useCliTools.ts`, `useSettings.ts`
    - Configure `QueryClient` with `staleTime: 30_000`, `retry: 2`, exponential back-off capped at 10 seconds; skip retry for `noRetry` errors
    - Implement cache invalidation: after `setContext`, `addKubeconfig`, `setKubeconfigSearchPath`, `updateSavedKubeconfig` mutations succeed, invalidate all `getSnapshot` and `getResources` keys
    - _Requirements: 10.1, 10.4_

- [ ] 10. UI shell — AppShell, ThemeProvider, Sidebar, ContextSelector
  - [~] 10.1 Implement ThemeProvider and density system
    - Create `src/components/ThemeProvider.tsx`: apply `data-theme` on `<html>` at mount and on theme change; read initial value from store
    - Apply `data-density` on `<body>` at mount and on density change
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [~] 10.2 Implement AppShell layout component
    - Create `src/components/AppShell.tsx`: two-column layout (fixed sidebar + scrollable main content)
    - Reads layout from store; no props required
    - _Requirements: 7.1_

  - [~] 10.3 Implement Sidebar component
    - Create `src/components/Sidebar.tsx` with seven collapsible groups: Cluster, Workloads, Network, Access Control, Configuration, Storage, Observability
    - Each group renders as a collapsible section with `aria-expanded` toggled by group header interaction
    - Each sidebar entry shows icon + active state indicator (visible only for current entry) + count badge (`formatCount`); hide badge while counts are not loaded
    - Cluster group contains: context selector, Add Kubeconfig action, Dashboard entry
    - On entry activation, navigate to corresponding resource view and update active state indicator
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [~] 10.4 Implement ContextSelector component
    - Create `src/components/ContextSelector.tsx`: dropdown listing all contexts, displays active context name
    - On selection, dispatch `bridge.setContext(id)`, update store via `setContexts`
    - Display active context name in Sidebar Cluster group and in the status bar
    - _Requirements: 4.4, 4.5_

  - [~] 10.5 Implement AddKubeconfigDialog component
    - Create `src/components/AddKubeconfigDialog.tsx` using Radix UI `Dialog`
    - `<textarea>` for YAML paste; client-side size check (reject > 1 MB immediately with inline error, keep dialog open)
    - On submit: call `bridge.addKubeconfig(yaml)`; on validation error display inline message without closing; on success invalidate `getContexts` query and close dialog
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7_

- [ ] 11. Dashboard and resource table infrastructure
  - [~] 11.1 Implement Dashboard component
    - Create `src/components/Dashboard.tsx`
    - Four health summary cards: Pods Running, Nodes Ready, Workloads Ready, Warnings — each with icon, StatusTone, `"ready/total"` primary value, bounded progress indicator (0–100%)
    - When total is 0, display `"0/0"` and 0% progress
    - Cluster controls: context selector, namespace selector (All + discovered namespaces), resource search field, refresh action, light/dark toggle, density selector, settings action
    - CLI status indicators for kubectl, Docker, kind: Detected / Not Detected / Checking; accessible label + tooltip; resolve to "Not Detected" if check does not complete within 5 s
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 11.2 Write property test for health card accuracy (Property 16)
    - **Property 16: Health Card Accuracy**
    - **Validates: Requirements 8.1, 8.3**
    - For any `(ready, total)` pair, card displays correct `"ready/total"`, correct progress %, correct StatusTone

  - [~] 11.3 Implement generic `ResourceTable` component
    - Create `src/components/ResourceTable.tsx` with full `ResourceTableProps<T>` generic interface from design
    - Filtering via `useMemo` with ≤ 300 ms case-insensitive substring match against name and namespace
    - Sorting via `Intl.Collator` (text) and `Number()` coercion (numeric); toggle asc/desc on column header click; show visible sort direction indicator
    - Row identity key: `${namespace ?? ''}/${name}`; preserve selection after refresh
    - Missing fields render as `<span aria-label="not available">-</span>`
    - Error banner when collection fetch fails; loading indicator while fetching; explicit empty-state message when no rows match filters
    - Escape all resource-derived text through `escapeHtml` before rendering
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15_

  - [ ] 11.4 Write property test for case-insensitive substring filter (Property 17)
    - **Property 17: Case-Insensitive Substring Filter**
    - **Validates: Requirements 9.7**
    - Filtered result contains exactly rows where name or namespace contains query as case-insensitive substring

  - [ ] 11.5 Write property test for column sort monotonicity (Property 19)
    - **Property 19: Column Sort Monotonicity**
    - **Validates: Requirements 9.11**
    - Sorted output is monotonically non-decreasing (asc) or non-increasing (desc) per column comparator

- [ ] 12. Resource Inspector and YAML viewer
  - [~] 12.1 Implement `ResourceInspector` component
    - Create `src/components/ResourceInspector.tsx` side panel
    - `MetadataSection`: kind, name, namespace, status (with StatusTone), age (`formatAge`), label count
    - `LabelList`: scrollable key-value pairs, max 50 visible, "No labels" empty state
    - `EventSection`: visible only for Events kind; render `message` or "No message" placeholder
    - Copy Resource Name and Copy Manifest actions via `tauri-plugin-clipboard-manager`; provide visual confirmation within 500 ms
    - On close: return focus to table's `[data-selected="true"]` row; preserve list view state (scroll, namespace, filters)
    - If YAML manifest cannot be retrieved, display error message, keep panel open, render all other available fields
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.7, 11.8_

  - [~] 12.2 Implement `YamlViewer` component
    - Create `src/components/YamlViewer.tsx`
    - YAML rendering pipeline: deep-clone → delete `metadata.managedFields` → `js-yaml` dump → token-based syntax highlight (keys, strings, numbers, booleans, comments → distinct `<span>` classes) → `escapeHtml` on all interpolated text
    - _Requirements: 11.4, 11.5_

- [ ] 13. kubectl Terminal
  - [~] 13.1 Implement `KubectlTerminal` component
    - Create `src/components/KubectlTerminal.tsx` two-pane layout
    - History pane: scrollable list of past commands (capped at 1000, oldest dropped on overflow), auto-scroll to bottom on submit/clear, clear history action always visible
    - Output pane: syntax-highlighted stdout/stderr + exit code (YAML keys, strings, numbers, booleans, list indicators in distinct classes); `escapeHtml` on all output; clear-output action; expand/collapse pane toggle
    - Tab shortcut: on `keydown Tab` when `event.target.value === 'k'` and cursor at index 1, replace with `'kubectl '` and move cursor to end
    - Concurrency guard: `isExecuting` Zustand slice; Run button disabled + spinner while true; Host Process rejects additional submissions during execution
    - Unavailable state when `cliTools.kubectl.available === false`: wrap in `aria-disabled` overlay at 50% opacity, show `KubectlUnavailableOverlay` with installation instructions, disable input/Run/toggle/clear with `disabled` and `aria-disabled="true"`. Docker/kind absence must NOT affect terminal availability
    - _Requirements: 12.1, 12.7, 12.9, 12.10, 12.11, 12.12, 12.13, 12.14, 12.15_

- [ ] 14. Settings view, About view, and native menu
  - [~] 14.1 Implement `SettingsView` component
    - Create `src/components/SettingsView.tsx`
    - Editable kubeconfig Search Path field with save and cancel actions
    - Save: call `bridge.setKubeconfigSearchPath(path)`; display success on valid absolute path; display error + retain entered value on empty or non-absolute path; do NOT persist on error
    - Cancel: restore field to last successfully saved value without persisting
    - List of Saved Kubeconfigs each with editable YAML `<textarea>` and Save Kubeconfig action
    - Read-only detected paths for Docker, kind, kubectl
    - Back navigation action returning user to cluster resource view
    - After save: reload and display updated persisted values; Host Process refreshes context discovery and reloads cluster data within 5 seconds
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [~] 14.2 Implement `AboutView` component and native menu integration
    - Create `src/components/AboutView.tsx`: display product name, version (`MAJOR.MINOR.PATCH`), description, author name/email, repository URL via `useQuery` calling `bridge.getAbout()`
    - Back-to-cluster navigation action
    - In `App.tsx`, after initial render register handlers for native menu events (Help → About, App → Settings)
    - Queue native menu events that fire before initial render; process them once rendering is complete
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 15. Column schema definitions and resource view wiring
  - [~] 15.1 Define column schemas and status tone mappings for all 22 resource kinds
    - Create `src/config/columns.ts` exporting a `ColumnDef<T>[]` per kind
    - Implement column schemas exactly as specified in the design: Nodes, Namespaces, Pods, Deployments, DaemonSets, StatefulSets, ReplicaSets, Jobs, CronJobs, Services, Ingresses, ServiceAccounts, ClusterRoles, Roles, ClusterRoleBindings, RoleBindings, ConfigMaps, Secrets, PVCs, PVs, StorageClasses, Events — with correct column types, sort flags, and render functions
    - Implement all status derivation helpers: Pod readiness state, workload readiness, Job lifecycle state, CronJob state, PV status (`non-Bound → Unbound`), StorageClass default field, memory quantity formatting
    - _Requirements: 9.13, 20.5_

  - [~] 15.2 Implement `ResourceView` and wire all 22 resource views
    - Create `src/components/ResourceView.tsx`: heading matching sidebar label, `ResourceTable` instantiated with the appropriate `ColumnDef[]`, `ResourceInspector` slide-over panel, namespace selector filtering
    - Register routes for all 22 resource kinds in `App.tsx` (react-router or Tauri router)
    - Namespace-scoped kinds filter by selected namespace; cluster-scoped kinds ignore namespace selector
    - Lazy-load on-demand collections (ReplicaSets, Jobs, CronJobs, PVs, StorageClasses, ServiceAccounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings) via `useResources` on first navigation
    - _Requirements: 9.1, 9.6, 10.4_

- [ ] 16. Accessibility, HTML escaping, and startup flow
  - [~] 16.1 Implement accessibility requirements across all components
    - Add accessible labels (`aria-label`) to all icon-only buttons, status indicators, namespace/context selectors, dialogs, live terminal output regions, and collapsible navigation groups
    - Ensure visible focus states on all interactive elements (Tailwind `focus-visible:ring` pattern)
    - Add hover tooltips (`title` or Radix `Tooltip`) on icon-only controls and status indicators
    - _Requirements: 19.1, 19.2, 19.3_

  - [~] 16.2 Implement startup sequence and fallback flow in renderer
    - `App.tsx`: on mount call `bridge.getContexts()` and `bridge.checkCliTools()` concurrently; hydrate stores
    - Display Dashboard in "connecting" state while initial snapshot loads
    - If startup does not complete within 10 seconds, display interactive error state with retry and Demo Mode options
    - If no kubeconfigs/contexts/cluster available, fall back to Demo Mode within 3 seconds without hanging
    - `bridge.getAbout()` populates `AboutView` via React Query
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7_

- [~] 17. Checkpoint — core implementation complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. TypeScript unit tests — remaining utility and bridge tests
  - [ ] 18.1 Write unit tests for safe nested object lookup (Requirement 20.1)
    - Verify `fieldValue` returns `undefined` (not throws) for missing nested paths
    - **Validates: Requirements 20.1**

  - [ ] 18.2 Write unit tests for resource column value derivation (Requirement 20.5)
    - Test Pod readiness, workload readiness, Job lifecycle, CronJob state, PV status, StorageClass default, memory formatting, label rendering
    - **Validates: Requirements 20.5**

  - [ ] 18.3 Write property test for bridge command whitelist rejection (Property 2)
    - **Property 2: Bridge Command Whitelist Rejection**
    - **Validates: Requirements 1.3, 1.7, 15.1**
    - For any command name not in the 13-command whitelist, Bridge API returns error without executing any action

  - [ ] 18.4 Write property test for context selection round-trip (Property 9)
    - **Property 9: Context Selection Round-Trip**
    - **Validates: Requirements 4.5**
    - Selecting context `c` via `setContext` and reading returned `ContextState.selectedId` equals `c.id`

  - [ ] 18.5 Write property test for saved kubeconfig stable ID (Property 11)
    - **Property 11: Saved Kubeconfig Stable ID Persistence**
    - **Validates: Requirements 5.3**
    - Stable ID assigned at save equals ID returned after app restarts and reloads settings

  - [ ] 18.6 Write property test for sidebar active state exclusivity (Property 14)
    - **Property 14: Sidebar Active State Exclusivity**
    - **Validates: Requirements 7.2**
    - For any sidebar state with one selected entry, exactly one element has active indicator; all others hidden

- [ ] 19. E2E tests with Playwright and mocked bridge
  - [~] 19.1 Create mocked bridge shim and E2E test harness
    - Create `e2e/mocks/bridge.ts`: inject `window.__TAURI_IPC__` shim before app initialization that returns demo fixture data for all `invoke()` calls
    - Configure `playwright.config.ts` to serve the Vite dev build and inject the shim; no live cluster, kubeconfig, or kubectl required
    - _Requirements: 21.1_

  - [ ] 19.2 Write E2E test: startup in Demo Mode (Requirement 21.1)
    - Launch with mocked bridge returning no kubectl, no kubeconfig, no live cluster
    - Verify app reaches usable initial state without hanging
    - **Validates: Requirements 2.5, 2.6, 21.1**

  - [ ] 19.3 Write E2E tests: sidebar resource views (Requirement 21.2)
    - Verify all 22+ resource views render correct heading, expected column headers, and ≥ 1 data row in demo mode
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.13, 21.2**

  - [ ] 19.4 Write E2E test: Dashboard (Requirement 21.3)
    - Verify Dashboard renders all four health summary cards without any resource table
    - **Validates: Requirements 8.1, 8.2, 21.3**

  - [ ] 19.5 Write E2E tests: namespace filtering, search, refresh, lazy loading, sorting, empty state (Requirement 21.4)
    - Verify namespace filter, case-insensitive search, refresh action, lazy loading of on-demand collections, sidebar navigation counts, column sorting, explicit empty states
    - **Validates: Requirements 9.6, 9.7, 9.8, 9.11, 21.4**

  - [ ] 19.6 Write E2E tests: Resource Inspector (Requirement 21.5, 21.6)
    - Verify selecting a table row opens Resource Inspector; closing returns focus to resource table
    - Verify Copy Resource Name and Copy Manifest actions
    - **Validates: Requirements 11.6, 11.7, 21.5, 21.6**

  - [ ] 19.7 Write E2E tests: Settings view (Requirement 21.7)
    - Verify opening Settings from toolbar and from native-menu event; saving kubeconfig Search Path; editing Saved Kubeconfig; reloading persisted values after save; adding kubeconfig via dialog
    - **Validates: Requirements 13.1–13.7, 21.7**

  - [ ] 19.8 Write E2E tests: kubectl Terminal (Requirement 21.8, 21.9)
    - Verify command submit with selected context, stdout/exit-status rendering, history maintain/clear, output clear, output pane expand/collapse, Tab shortcut
    - Verify kubectl not-detected state: input/Run/toggle/clear disabled, 50% opacity, unavailable overlay shown; Docker/kind absence does NOT disable terminal
    - **Validates: Requirements 12.1–12.15, 21.8, 21.9**

  - [ ] 19.9 Write E2E tests: theme and density controls (Requirement 21.10)
    - Verify light/dark toggle and density selector update document-level `data-theme`/`data-density` attributes immediately
    - **Validates: Requirements 18.1–18.4, 21.10**

  - [ ] 19.10 Write E2E visual regression tests (Requirement 21.11)
    - Capture baseline screenshots for: Dashboard, every resource view, Settings, saved kubeconfigs list, unavailable terminal state, light mode, dark mode
    - Fail on pixel diff above 0.1% threshold using `toMatchSnapshot()`
    - **Validates: Requirements 21.11**

- [~] 20. Checkpoint — all tests passing
  - Ensure all unit, property, and E2E tests pass, ask the user if questions arise.

- [ ] 21. CI/CD pipeline
  - [~] 21.1 Create GitHub Actions `test` job
    - Create `.github/workflows/ci.yml`
    - `test` job on `ubuntu-latest`: `pnpm install` → `vitest --run` (unit tests with HTML report) → `cargo test` (Rust tests) → `pnpm playwright install --with-deps` → `pnpm playwright test` (E2E)
    - _Requirements: 22.2_

  - [~] 21.2 Create GitHub Actions `build` job (matrix)
    - `build` job depending on `test`: matrix over `ubuntu-latest`, `windows-latest`, `macos-latest`
    - Install Tauri prerequisites per platform; run `pnpm tauri build`; upload artifacts: `.AppImage`, `.msi`, `.dmg`
    - Build job must be independent of UI toolkit version
    - _Requirements: 22.1, 22.4_

  - [~] 21.3 Create GitHub Actions `docs` and `deploy` jobs
    - `docs` job: `pnpm typedoc` → `docs/api/`; `cargo doc --no-deps` → `docs/rust-api/`; copy Playwright HTML report → `docs/e2e-report/`; copy Vitest HTML report → `docs/unit-report/`
    - `deploy` job: publish `docs/` to GitHub Pages via `actions/deploy-pages`
    - Documentation site structure: `/` (app overview), `/api/` (TypeDoc), `/rust-api/` (rustdoc), `/unit-report/` (Vitest HTML, fallback "Report unavailable"), `/e2e-report/` (Playwright HTML, fallback "Report unavailable")
    - _Requirements: 22.2, 22.3_

- [~] 22. Final checkpoint
  - Ensure all tests pass, all CI jobs succeed, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build.
- Every task references specific requirements for traceability.
- Checkpoints ensure incremental validation at natural breakpoints.
- Property-based tests (fast-check / proptest) validate universal invariants; unit tests cover specific examples and edge cases.
- The mocked bridge shim means E2E tests require no live cluster, kubectl, or kubeconfig — safe for any CI environment.
- On-demand collections (ReplicaSets, Jobs, CronJobs, PVs, StorageClasses, ServiceAccounts, RBAC kinds) are fetched lazily on first navigation; all others are eager at startup.
- All user-facing text from external sources (Kubernetes API, kubeconfig files, user input) must pass through `escapeHtml` before HTML interpolation.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1", "4.2", "4.3", "5.4", "7.1"] },
    { "id": 4, "tasks": ["2.3", "2.4", "3.6", "4.1", "5.1", "5.5", "7.2", "7.3"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.7", "3.8", "3.9", "4.4", "4.5", "5.2", "5.3", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "9.1", "9.2"] },
    { "id": 8, "tasks": ["9.3", "9.4", "9.5", "10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3", "10.4", "10.5", "11.1", "11.3"] },
    { "id": 10, "tasks": ["11.2", "11.4", "11.5", "12.1", "12.2", "13.1", "14.1", "14.2"] },
    { "id": 11, "tasks": ["15.1"] },
    { "id": 12, "tasks": ["15.2", "16.1", "16.2"] },
    { "id": 13, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5", "18.6", "19.1"] },
    { "id": 14, "tasks": ["19.2", "19.3", "19.4", "19.5", "19.6", "19.7", "19.8", "19.9", "19.10"] },
    { "id": 15, "tasks": ["21.1"] },
    { "id": 16, "tasks": ["21.2"] },
    { "id": 17, "tasks": ["21.3"] }
  ]
}
```
