#!/usr/bin/env bash
set -euo pipefail

echo "=== Building with vinext ==="
npx vinext build

echo "=== Setting up Vercel Build Output ==="
rm -rf .vercel/output
mkdir -p .vercel/output/static
mkdir -p .vercel/output/functions/index.func

# Copy static files (client assets)
cp -r dist/client/* .vercel/output/static/

# Copy server function files
cp -r dist/server/* .vercel/output/functions/index.func/

# Create function config
cat > .vercel/output/functions/index.func/.vc-config.json << 'EOF'
{
  "runtime": "nodejs22.x",
  "handler": "index.js",
  "launcherType": "Nodejs",
  "shouldAddHelpers": true,
  "supportsResponseStreaming": true
}
EOF

# Create Vercel output config
cat > .vercel/output/config.json << 'EOF'
{
  "version": 3,
  "