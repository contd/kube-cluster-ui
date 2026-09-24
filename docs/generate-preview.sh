#!/usr/bin/env bash
set -euo pipefail

ffmpeg -y -i ../test-results/demo-video-demo-video-flow-58b7a-nd-opens-a-Pod-detail-panel/video.webm \
  -vf "fps=1,scale=1280:-1" \
  docs/video-preview.gif

exit 0