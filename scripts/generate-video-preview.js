/** Generates the animated README preview from the recorded Playwright video. */
const { spawnSync } = require('node:child_process');

/** Skips optional media generation in automated CI environments. */
if (process.env.CI || process.env.GITHUB_ACTIONS) {
  console.log('Skipping ffmpeg video preview generation in CI.');
  process.exit(0);
}

/** Converts the recorded Playwright WebM into the repository's README preview GIF. */
const result = spawnSync(
  'ffmpeg',
  ['-y', '-i', 'assets/snapshots/video.webm', '-vf', 'fps=1,scale=1280:-1', 'assets/video-preview.gif'],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}
