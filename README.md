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

---
## Build and Package for Windows

This project is configured with Electron Forge and includes the Squirrel Windows maker in [forge.config.ts](forge.config.ts). On a Windows machine, you can build and package the app into a Windows installer or distributable zip.

> Important: the Windows installer is produced on a Windows machine. The `MakerSquirrel` configuration is Windows-specific and is not meant to be run from a non-Windows host for native Windows packaging.

### Prerequisites

Before building, install:

- Node.js LTS (18+ recommended; current project targets Electron 44)
- Git for Windows
- A Windows environment such as Windows 10/11, or a Windows build VM/container
- Administrator access if you need to install dependencies or sign the installer

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

### Create a packaged app without a Windows installer

This step produces an app bundle for the current platform without creating the final installer:

```bash
npm run package
```

The output is typically placed in a folder under `out/`.

### Build with Electron Builder

Electron Builder is configured in [electron-builder.yml](electron-builder.yml) for all desktop platforms. It uses the Forge Vite plugin to compile the application bundles, then creates native distributables in `dist/`:

```bash
npm run package:builder
```

The configured targets are:

- Windows: NSIS installer, portable executable, and zip
- macOS: DMG and zip
- Linux: AppImage, deb, rpm, and tar.gz

### Create a Windows installer

To build the Windows distributable using the configured Forge makers:

```bash
npm run make
```

This uses Electron Forge with the Squirrel maker configured in [forge.config.ts](forge.config.ts). On Windows, this produces the installer artifacts in the `out/make` directory, typically under a path similar to:

```text
out\make\squirrel.windows\x64\
```

The generated files usually include:

- the `.exe` installer
- a `.nupkg` package
- a ZIP archive if the project is configured to emit one

### Build a release artifact from the command line

If you want to trigger a package build in a CI or release script, you can run:

```bash
npm run make
```

or, for a non-installer package only:

```bash
npm run package
```

### Common troubleshooting

- If `npm install` fails, make sure Node.js is installed and `npm` is on your `PATH`.
- If the Windows build fails, verify you are running the commands on a Windows machine.
- If the app does not launch after packaging, open the generated app and confirm the required runtime dependencies are present.
- If you need signing for a production release, add code-signing configuration before publishing the installer.

### Notes

- The project defines `@electron-forge/maker-squirrel` in [forge.config.ts](forge.config.ts), which is the Windows installer generator.
- The project also includes a GitHub publisher configuration in the same Forge config for release publishing, but the installer creation itself is driven by `npm run make`.

---

## Useful commands summary

```bash
npm install
npm start
npm run package
npm run make
```
