// Vercel serverless function wrapper for vinext
// This wrapper intercepts static file requests and serves them from the filesystem

import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Try to load the vinext server
let vinextServer;
try {
  vinextServer = await import('./index.js');
} catch (e) {
  console.error('Failed to load vinext server:', e.message);
}

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

async function serveStaticFile(pathname) {
  // Try from client directory (copied alongside the function)
  const clientPath = join(__dirname, 'client', pathname);
  try {
    const content = await readFile(clientPath);
    const ext = extname(pathname);
    return new Response(content, {
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return null;
  }
}

export async function fetch(req) {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Serve static assets
    if (pathname.startsWith('/assets/') || pathname.startsWith('/_vinext_fonts/') ||
        pathname.endsWith('.svg') || pathname.endsWith('.png') || pathname === '/favicon.svg') {
      const staticResp = await serveStaticFile(pathname);
      if (staticResp) return staticResp;
    }

    // Delegate to vinext server
    if (vinextServer && vinextServer.default && vinextServer.default.fetch) {
      // Create a fake env with ASSETS fetch capability
      const env = {
        ASSETS: {
          fetch: async (assetReq) => {
            const assetUrl = new URL(assetReq.url);
            const resp = await serveStaticFile(assetUrl.pathname);
            return resp || new Response('Not found', { status: 404 });
          }
        }
      };
      return vinextServer.default.fetch(req, env, {
        waitUntil: (promise) => { promise.catch(() => {}); },
        passThroughOnException: () => {},
      });
    }

    return new Response('Server not ready', { status: 503 });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}