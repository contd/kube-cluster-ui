## Build and Package for Windows

This project is configured with Electron Forge and includes the Squirrel Windows maker in [forge.config.ts](forge.config.ts). On a Windows machine, you can build and package the app into a Windows installer or distributable zip.

> Important: the Windows installer is produced on a Windows machine. The `MakerSquirrel` configuration is Windows-specific and is not meant to be run from a non-Windows host for native Windows packaging.

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

