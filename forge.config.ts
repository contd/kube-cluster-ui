import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
// import { MakerZIP } from '@electron-forge/maker-zip';
// import { MakerDeb } from '@electron-forge/maker-deb';
// import { MakerRpm } from '@electron-forge/maker-rpm';
// import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { app } from 'electron';
import path from 'node:path';

const customIconPath = path.resolve(__dirname, 'src', 'icon');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: customIconPath,
    // osxSign: {
    //   identity: process.env.APPLE_SIGNING_IDENTITY,
    //   hardenedRuntime: true,
    //   gatekeeperAssess: false,
    // },

    // osxNotarize: {
    //   appleId: process.env.APPLE_ID!,
    //   appleIdPassword: process.env.APPLE_ID_PASSWORD!,
    //   teamId: process.env.APPLE_TEAM_ID!,
    // },
  },
  rebuildConfig: {},
  makers: [
		new MakerSquirrel({
      setupIcon: path.resolve(__dirname, 'src', 'icon.ico'),
    }),
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win64', 'linux'],
      config: {
        icon: path.resolve(__dirname, 'src', 'icon.ico'),
      }
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: () => ({
        icon: path.resolve(__dirname, 'src', 'icon.icns'),
      })
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'contd',
          name: 'kube-cluster-ui',
          appId: 'com.contd.kube-cluster-ui',
        },
        prerelease: false,
        draft: true
      }
    }
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
