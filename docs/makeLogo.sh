#!/usr/bin/env bash
set -euo pipefail
# This script generates the logo and favicon for the project.   

# convert the SVG logo to .png
echo "Generating logo.png from kube-cluster-ui.svg..."
convert -background none kube-cluster-ui.svg ../src/logo.png
# convert to .ico
echo "Generating logo.ico from logo.png..."
convert ../src/logo.png -define icon:auto-resize=64,48,32,16 ../src/logo.ico
# convert to .icns
echo "Generating logo.icns from logo.png..."
convert ../src/logo.png -define icon:auto-resize=128,64,48,32,16 ../src/logo.icns

exit 0