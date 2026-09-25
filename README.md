# Kube Cluster UI

[![Build and publish desktop binaries](https://github.com/contd/kube-cluster-ui/actions/workflows/release.yml/badge.svg)](https://github.com/contd/kube-cluster-ui/actions/workflows/release.yml)
[![Windows build](https://img.shields.io/github/actions/workflow/status/contd/kube-cluster-ui/release.yml?job=build-windows&label=Windows)](https://github.com/contd/kube-cluster-ui/actions/workflows/release.yml)
[![macOS build](https://img.shields.io/github/actions/workflow/status/contd/kube-cluster-ui/release.yml?job=build-macos&label=macOS)](https://github.com/contd/kube-cluster-ui/actions/workflows/release.yml)
[![Linux build](https://img.shields.io/github/actions/workflow/status/contd/kube-cluster-ui/release.yml?job=build-linux&label=Linux)](https://github.com/contd/kube-cluster-ui/actions/workflows/release.yml)


<table>
	<tr>
		<td><img src="docs/main-interface.png" alt="Kube Cluster UI main interface" /></td>
		<td><img src="docs/main-interface-dark.png" alt="Kube Cluster UI dark mode interface" /></td>
	</tr>
</table>

## Latest builds

Download the newest packaged releases from GitHub:

- [`Windows` builds](https://github.com/contd/kube-cluster-ui/releases/latest)
- [`macOS` builds](https://github.com/contd/kube-cluster-ui/releases/latest)
- [`Linux` builds](https://github.com/contd/kube-cluster-ui/releases/latest)
- [Latest release](https://github.com/contd/kube-cluster-ui/releases/latest)
- [Latest `GitHub` Actions build](https://github.com/contd/kube-cluster-ui/actions/workflows/release.yml)

---

[![Kube Cluster UI demo video](docs/video-preview.gif)](docs/video-preview.gif)

## Features

Each entry documents a view covered by a Playwright test. When adding a navigation view, add its test, numbered snapshot, and feature note here.

- **Dashboard:** Cluster health summary cards and the context-bound command terminal. <br><img src="docs/snapshots/01-dashboard.png" alt="Dashboard view" width="640">
- **Nodes:** Node readiness, roles, taints, version, CPU, memory, and age. <br><img src="docs/snapshots/02-nodes.png" alt="Nodes view" width="640">
- **Namespaces:** Namespace status, age, and label summary. <br><img src="docs/snapshots/03-namespaces.png" alt="Namespaces view" width="640">
- **Pods:** Container count, phase, restarts, node placement, and controller. <br><img src="docs/snapshots/04-pods.png" alt="Pods view" width="640">
- **Deployments:** Deployment pod and replica counts. <br><img src="docs/snapshots/05-deployments.png" alt="Deployments view" width="640">
- **DaemonSets:** Desired, current, ready, updated, and available pod counts. <br><img src="docs/snapshots/06-daemonsets.png" alt="DaemonSets view" width="640">
- **StatefulSets:** StatefulSet pod and replica counts. <br><img src="docs/snapshots/07-statefulsets.png" alt="StatefulSets view" width="640">
- **ReplicaSets:** Desired, current, and ready replica counts. <br><img src="docs/snapshots/08-replicasets.png" alt="ReplicaSets view" width="640">
- **Jobs:** Start and end times, completion, and termination state. <br><img src="docs/snapshots/09-jobs.png" alt="Jobs view" width="640">
- **CronJobs:** Schedule, suspension, active jobs, and last schedule time. <br><img src="docs/snapshots/10-cronjobs.png" alt="CronJobs view" width="640">
- **Persistent Volumes:** Storage class, capacity, claim, age, and status. <br><img src="docs/snapshots/11-pvs.png" alt="Persistent Volumes view" width="640">
- **Storage Classes:** Provisioner, reclaim policy, binding mode, and expansion. <br><img src="docs/snapshots/12-storageclasses.png" alt="Storage Classes view" width="640">
- **Services:** Service type, cluster IP, and ports. <br><img src="docs/snapshots/13-services.png" alt="Services view" width="640">
- **Ingresses:** Ingress class and configured hosts. <br><img src="docs/snapshots/14-ingresses.png" alt="Ingresses view" width="640">
- **ConfigMaps:** Namespaced configuration maps and key counts. <br><img src="docs/snapshots/15-configmaps.png" alt="ConfigMaps view" width="640">
- **Secrets:** Secret type and key counts. <br><img src="docs/snapshots/16-secrets.png" alt="Secrets view" width="640">
- **Persistent Volume Claims:** Claim status, capacity, and storage class. <br><img src="docs/snapshots/17-pvcs.png" alt="Persistent Volume Claims view" width="640">
- **Events:** Event type, reason, involved object, count, and last-seen time. <br><img src="docs/snapshots/18-events.png" alt="Events view" width="640">
- **Unavailable terminal:** The terminal is dimmed and disabled when kubectl is missing. <br><img src="docs/snapshots/19-kubectl-unavailable.png" alt="Dashboard terminal disabled because kubectl is unavailable" width="640">

---

## Development

> For windows users see [WIN-BUILD.md](WIN-BUILD.md).

### Install dependencies

From the project root:

```bash
npm install
```

If you are using a fresh checkout and the dependency tree is not yet restored, this will install Electron, Vite, and the Forge makers used by the project.

The project omits optional native WebSocket accelerators such as `bufferutil` and `utf-8-validate`. Kubernetes client-node uses `ws`, which automatically falls back to its JavaScript implementation, avoiding native addon compilation problems on Windows 11.

### Run locally during development

```bash
npm start
```

This starts the Electron app in development mode.

### Run Playwright UI tests

Install the Playwright browser once, then run the UI tests:

```bash
npx playwright install chromium chromium-headless-shell
npm run test:e2e
```

The tests run against the renderer with no kubeconfig available, so they use the same built-in demo data shown by the app when it cannot connect to Kubernetes. They cover every resource view and basic inspector, sorting, theme, and compact-mode interactions.

### Run unit tests

```bash
npm run test:unit
```

The unit tests cover the renderer's pure formatting, status, identity, and demo-data helper functions with multiple inputs.

### Build with Electron Builder

Electron Builder is configured in [electron-builder.yml](electron-builder.yml) for all desktop platforms. It uses the Forge Vite plugin to compile the application bundles, then creates native distributables in `dist/`:

```bash
npm run package:builder
```

The configured targets are:

- Windows: NSIS installer, portable executable, and zip
- macOS: DMG and zip
- Linux: AppImage, deb, rpm, and tar.gz

## Useful commands summary

```bash
npm install
npm start
npm run package:builder
npm run test:e2e
npm run test:unit
npm run test
```
