import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/site-metadata/route";

test("site metadata reads the real page title and icon", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response('<html><head><title>真实系统名称</title><link rel="icon" href="/brand.svg"></head></html>', { status: 200, headers: { "content-type": "text/html" } });
  const response = await POST(new Request("http://app.test/api/site-metadata", { method: "POST", body: JSON.stringify({ url: "https://example.com/path" }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { title: "真实系统名称", icon: "https://example.com/brand.svg", finalUrl: "https://example.com/path" });
});

test("site metadata refuses redirects into private networks", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  };
  const response = await POST(new Request("http://app.test/api/site-metadata", { method: "POST", body: JSON.stringify({ url: "https://example.com" }) }));
  assert.equal(response.status, 502);
  assert.equal(requests, 1);
});

test("site metadata rejects private addresses before requesting them", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error("fetch must not run"); };
  const response = await POST(new Request("http://app.test/api/site-metadata", { method: "POST", body: JSON.stringify({ url: "http://192.168.1.1" }) }));
  assert.equal(response.status, 400);
});
