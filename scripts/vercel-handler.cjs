// Vercel serverless function handler for vinext
// Uses @vercel/node builder with CommonJS

const { readFile } = require('node:fs/promises');
const { join, extname } = require('node:path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/auth'];

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
  // Remove leading slash to avoid path.join treating it as absolute path
  const relativePath = pathname.replace(/^\//, '');
  // Try multiple possible base directories:
  // 1. dist/client/ (local dev)
  // 2. client/ (Vercel deployment where @vercel/node flattens dist/)
  const baseDirs = [
    join(__dirname, '..', 'dist', 'client'),
    join(__dirname, '..', 'client'),
    join(__dirname, 'client'),
  ];
  
  for (const baseDir of baseDirs) {
    try {
      const clientPath = join(baseDir, relativePath);
      const content = await readFile(clientPath);
      const ext = extname(pathname);
      return { content, contentType: MIME_TYPES[ext] || 'application/octet-stream' };
    } catch {
      // Fallback: _vinext_fonts may be under assets/ directory
      if (relativePath.startsWith('_vinext_fonts/')) {
        try {
          const altPath = join(baseDir, 'assets', relativePath);
          const content = await readFile(altPath);
          const ext = extname(pathname);
          return { content, contentType: MIME_TYPES[ext] || 'application/octet-stream' };
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

// Parse cookie string into object
function parseCookies(cookieStr) {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(';').forEach(pair => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

// Read request body as JSON
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Convert Node.js req to a Web Request for vinext
function nodeReqToWebRequest(req) {
  const host = req.headers['host'] || req.headers['x-forwarded-host'] || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const fullUrl = `${protocol}://${host}${req.url}`;

  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(v => webHeaders.append(key, v));
      } else {
        webHeaders.set(key, String(value));
      }
    }
  }

  return new Request(fullUrl, {
    method: req.method || 'GET',
    headers: webHeaders,
  });
}

// Write a Web Response to a Node.js ServerResponse
// Handles multiple Set-Cookie headers correctly
async function writeResponse(webResp, res) {
  const headers = {};
  const setCookieHeaders = [];
  for (const [key, value] of webResp.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      setCookieHeaders.push(value);
    } else {
      headers[key] = value;
    }
  }
  if (setCookieHeaders.length > 0) {
    headers['set-cookie'] = setCookieHeaders;
  }
  res.writeHead(webResp.status, headers);
  if (webResp.body) {
    const reader = webResp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Serve static assets (no auth required)
    if (pathname.startsWith('/assets/') || pathname.startsWith('/_vinext_fonts/') ||
        pathname.endsWith('.svg') || pathname.endsWith('.png') || pathname === '/favicon.svg') {
      const staticFile = await serveStaticFile(pathname);
      if (staticFile) {
        res.writeHead(200, {
          'Content-Type': staticFile.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        res.end(staticFile.content);
        return;
      }
    }

    // Handle auth API routes directly (login/signup)
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password } = body;

      if (!email || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '邮箱和密码不能为空' }));
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: data.error_description || data.msg || '登录失败' }));
        return;
      }

      // Set session cookie - use the actual project ref from env or extract from URL
      // @supabase/ssr uses: sb-{project-ref}-auth-token
      // For https://yzyhhrxatqpixgkipfye.supabase.co, project-ref is yzyhhrxatqpixgkipfye
      const supabaseUrl = new URL(SUPABASE_URL);
      const projectRef = supabaseUrl.hostname.split('.')[0];
      const cookieName = `sb-${projectRef}-auth-token`;
      const cookieValue = encodeURIComponent(JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      }));

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `${cookieName}=${cookieValue}; Path=/; SameSite=Lax; Max-Age=604800`,
      });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (pathname === '/api/auth/signup' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password } = body;

      if (!email || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '邮箱和密码不能为空' }));
        return;
      }

      if (password.length < 6) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '密码至少 6 位' }));
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: data.error_description || data.msg || '注册失败' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Auth check for non-public paths
    if (!PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
      // Check Supabase session from cookies
      // @supabase/ssr uses cookie names like: sb-<project-ref>-auth-token
      const cookies = parseCookies(req.headers.cookie || '');
      console.log('Cookies found:', Object.keys(cookies).join(', '));

      // Find the Supabase auth token cookie (starts with "sb-")
      let accessToken = null;
      for (const [key, value] of Object.entries(cookies)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          try {
            // parseCookies already decoded the value, try parsing as JSON directly
            const session = JSON.parse(value);
            accessToken = session.access_token;
          } catch {
            // If not JSON, treat as raw token
            accessToken = value;
          }
          break;
        }
      }

      if (!accessToken) {
        console.log('No auth token found, redirecting to login');
        const loginUrl = new URL('/login', url.origin);
        loginUrl.searchParams.set('next', pathname);
        res.writeHead(307, { 'Location': loginUrl.toString() });
        res.end();
        return;
      }

      // Verify token with Supabase
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('Missing Supabase env vars:', { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY });
        const loginUrl = new URL('/login', url.origin);
        loginUrl.searchParams.set('next', pathname);
        res.writeHead(307, { 'Location': loginUrl.toString() });
        res.end();
        return;
      }
      try {
        const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        });
        if (!verifyRes.ok) {
          console.log('Token verification failed, status:', verifyRes.status);
          const loginUrl = new URL('/login', url.origin);
          loginUrl.searchParams.set('next', pathname);
          res.writeHead(307, { 'Location': loginUrl.toString() });
          res.end();
          return;
        }
      } catch (err) {
        console.error('Auth verification error:', err.message);
        const loginUrl = new URL('/login', url.origin);
        loginUrl.searchParams.set('next', pathname);
        res.writeHead(307, { 'Location': loginUrl.toString() });
        res.end();
        return;
      }
    }

    // Delegate to vinext server (try multiple paths for local dev vs Vercel deployment)
    let vinextServer = null;
    const serverPaths = [
      '../dist/server/index.js',  // local dev
      './index.js',                // Vercel deployment (dist/ flattened)
    ];
    for (const serverPath of serverPaths) {
      try {
        vinextServer = await import(serverPath);
        break;
      } catch {
        continue;
      }
    }
    if (vinextServer && vinextServer.default && vinextServer.default.fetch) {
      const webReq = nodeReqToWebRequest(req);
      const env = {
        ASSETS: {
          fetch: async (assetReq) => {
            const assetUrl = new URL(assetReq.url);
            const file = await serveStaticFile(assetUrl.pathname);
            if (file) {
              return new Response(file.content, {
                headers: {
                  'Content-Type': file.contentType,
                  'Cache-Control': 'public, max-age=31536000, immutable',
                },
              });
            }
            return new Response('Not found', { status: 404 });
          }
        }
      };
      const webResp = await vinextServer.default.fetch(webReq, env, {
        waitUntil: (promise) => { promise.catch(() => {}); },
        passThroughOnException: () => {},
      });
      await writeResponse(webResp, res);
      return;
    }

    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Server not ready');
  } catch (err) {
    console.error('Handler error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
};