#!/usr/bin/env bash
set -e

# Run vinext build
npx vinext build

# Create Vercel Build Output API v3 structure
rm -rf .vercel/output
mkdir -p .vercel/output/static
mkdir -p .vercel/output/functions/index.func

# Copy static assets (client-side files) to static directory
cp -r dist/client/* .vercel/output/static/

# Copy server function files
cp -r dist/server/* .vercel/output/functions/index.func/

# Copy the vercel-entry.mjs wrapper (it will be the handler)
cp scripts/vercel-entry.mjs .vercel/output/functions/index.func/

# Copy client assets into the function directory so vercel-entry.js can serve them
cp -r dist/client .vercel/output/functions/index.func/client

# Create package.json to enable ES modules
cat > .vercel/output/functions/index.func/package.json << 'EOF'
{"type":"module"}
EOF

# Create function config - use vercel-entry.mjs as handler
cat > .vercel/output/functions/index.func/.vc-config.json << 'EOF'
{"runtime":"nodejs22.x","handler":"vercel-entry.mjs","launcherType":"Nodejs","shouldAddHelpers":true}
EOF

# Create output config
echo '{"version":3}' > .vercel/output/config.json

echo "Vercel output prepared successfully"