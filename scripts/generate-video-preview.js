const { spawnSync } = require('node:child_process');

if (process.env.CI || process.env.GITHUB_ACTIONS) {
  console.log('Skipping ffmpeg video preview generation in CI.');
  process.exit(0);
}

const result = spawnSync(
  'ffmpeg',
  ['-y', '-i', 'docs/snapshots/video.webm', '-vf', 'fps=1,scale=1280:-1', 'docs/video-preview.gif'],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}
