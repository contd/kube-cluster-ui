#!/usr/bin/env bash
set -euo pipefail

npm run generate:video-preview --prefix "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
