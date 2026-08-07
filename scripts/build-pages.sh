#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

project_root="${SITES_PROJECT_ROOT}"
vinext="${project_root}/node_modules/.bin/vinext"

if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci first." >&2
  exit 69
fi

"${vinext}" build

server_dir="${project_root}/dist/server"
pages_dir="${project_root}/dist/client"

[[ -f "${server_dir}/index.js" ]] || {
  echo "Missing Vinext Worker entry: dist/server/index.js" >&2
  exit 66
}

# Cloudflare Pages advanced mode executes _worker.js and provides env.ASSETS.
# The existing Vinext Worker already uses that binding, so keep its runtime
# intact and package the server-side modules beside the Pages entry.
cp "${server_dir}/index.js" "${pages_dir}/_worker.js"
cp "${server_dir}/index.js" "${pages_dir}/index.js"
cp "${server_dir}/__vite_rsc_assets_manifest.js" "${pages_dir}/__vite_rsc_assets_manifest.js"

rm -rf "${pages_dir}/ssr"
cp -R "${server_dir}/ssr" "${pages_dir}/ssr"

# Vinext writes a Worker-specific Wrangler redirect with no_bundle=true.
# Pages must bundle _worker.js and its SSR modules, so remove that redirect.
rm -f "${project_root}/.wrangler/deploy/config.json"

# Cloudflare Pages advanced mode needs _routes.json to route static assets
# directly and send everything else to the worker.
cat > "${pages_dir}/_routes.json" <<'ROUTES'
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/assets/*", "/favicon.svg", "/file.svg", "/globe.svg", "/og.png", "/window.svg"]
}
ROUTES

echo "Prepared Cloudflare Pages artifact in dist/client."
