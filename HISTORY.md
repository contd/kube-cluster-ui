# Project History

Completed changes from the development work recorded in this chat.

## Navigation

- Made Cluster, Workloads, Network, Configuration, Storage, and Observability sidebar groups independently collapsible and expandable, with accessible disclosure controls.
- Doubled navigation group heading font sizes in normal and compact density modes.
- Set Configuration, Storage, and Observability to start collapsed; the other groups start expanded.
- Hide navigation count badges for zero items and show them as resource collections populate.
- Updated navigation browser tests to expand collapsed groups before selecting their resource entries.
- Added an Access Control group with Service Accounts, Cluster Roles, Roles, Cluster Role Bindings, and Role Bindings. The views use the Kubernetes CoreV1 and RBAC v1 APIs with namespace-aware filtering.

## Dashboard Terminal

- Added a two-column Dashboard terminal: enter kubectl commands on the left and view syntax-highlighted output on the right.
- Added a shell-free Electron IPC runner that applies the selected kubeconfig and context. Saved kubeconfigs are written temporarily for command execution and removed afterward.
- Added output-panel expansion from the default 50/50 split to 20/80, with a second click restoring equal columns.
- Added a Clear action for terminal output and command transcript, plus separate command history capped at 1,000 entries. Clear history removes the list without clearing output; history otherwise lasts for the app session and survives cluster switches.
- Added input normalization so commands beginning with `k ` immediately become `kubectl `, and Tab completes a bare `k` to `kubectl ` with the caret after the space. The `k` alias, including bare `k`, is accepted by the command parser.
- Added a startup kubectl availability check. When unavailable, both terminal columns are dimmed under a centered explanation and their controls are disabled.
- Updated the status bar to show the connected cluster on the left and kubectl, Docker, and kind detection on the right, each with independent green, red, and checking indicators. Detection state is available in CSS hover/focus tooltips.

## Playwright Snapshots

- Added a deterministic mocked live-cluster fixture for browser tests and video recording. Tests no longer rely on the demo fallback or display its banner.
- Generated numbered snapshots for the Dashboard, all 22 resource views, and the unavailable-terminal state in [docs/snapshots](docs/snapshots).
- Replaced the README Features section with view descriptions and inline snapshots. View tests use explicit snapshot names so future views can be appended without renumbering existing images.
- Updated the video test to save its recording to [docs/snapshots/video.webm](docs/snapshots/video.webm).
- Added the `generate:video-preview` npm script and chained it after Playwright in `test:e2e`; the aggregate `test` script now invokes `test:e2e` as well. The conversion command places `-vf` after `-i` to satisfy ffmpeg option ordering.
- Updated [docs/generate-preview.sh](docs/generate-preview.sh) to delegate to the npm preview-generation script.

## Verification

- The final Playwright end-to-end run passed all 37 tests, including Access Control views, navigation count updates, video recording, and GIF generation.
- The unit-test suite passed all 68 tests.
- The generated GIF was verified through both `npm run test:e2e` and `bash docs/generate-preview.sh`.
- Editor diagnostics and `git diff --check` were clean. Scoped ESLint reported no errors; three pre-existing warnings remain in `src/main.ts`.
