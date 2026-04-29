import { NextRequest, NextResponse } from "next/server";
import { getServerBackendBase } from "@/lib/api-base";
import { readFileSync } from "fs";

export const dynamic = "force-dynamic";

function filterProxyHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    // Remove hop-by-hop and browser-specific headers that break undici fetch proxying.
    if (lower === "host") return;
    if (lower === "connection") return;
    if (lower === "content-length") return;
    if (lower === "accept-encoding") return;
    if (lower === "keep-alive") return;
    if (lower === "proxy-connection") return;
    if (lower === "transfer-encoding") return;
    if (lower === "upgrade") return;
    headers.set(key, value);
  });
  return headers;
}

function isLikelyLocalBackend(base: string): boolean {
  try {
    const u = new URL(base);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function resolveWindowsHostFromWsl(): string | null {
  // In WSL2, Windows is reachable via the nameserver IP in /etc/resolv.conf.
  // Guard this for non-Linux environments.
  try {
    const raw = readFileSync("/etc/resolv.conf", "utf8");
    const match = raw.match(/^nameserver\s+([0-9.]+)\s*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function buildFallbackBackendBases(base: string): string[] {
  if (!process.env.WSL_DISTRO_NAME && !process.env.WSL_INTEROP) {
    return [];
  }
  if (!isLikelyLocalBackend(base)) {
    return [];
  }
  const out: string[] = [];
  const winHost = resolveWindowsHostFromWsl();
  if (winHost) {
    out.push(`http://${winHost}:8000`);
  }
  // Sometimes available in WSL environments.
  out.push("http://host.docker.internal:8000");
  return out;
}

async function proxy(request: NextRequest, path: string[]) {
  const backendBase = getServerBackendBase();
  const candidates = [backendBase, ...buildFallbackBackendBases(backendBase)];
  const targetPath = `/api/${path.join("/")}${request.nextUrl.search}`;
  const headers = filterProxyHeaders(request.headers);

  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
    redirect: "manual",
  };

  let lastError: any = null;
  for (const base of candidates) {
    const targetUrl = `${base}${targetPath}`;
    try {
      const response = await fetch(targetUrl, init);
      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (err: any) {
      lastError = err;
    }
  }

  const message = lastError?.message ? String(lastError.message) : String(lastError);
  const cause = lastError?.cause ? String(lastError.cause) : undefined;
  const code = lastError?.code ? String(lastError.code) : undefined;
  const stack = lastError?.stack ? String(lastError.stack) : undefined;
  return NextResponse.json(
    { error: "Proxy request failed", backendBase, tried: candidates, message, cause, code, stack },
    { status: 502 },
  );
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  const { path } = context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  const { path } = context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: { params: { path: string[] } }) {
  const { path } = context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: { path: string[] } }) {
  const { path } = context.params;
  return proxy(request, path);
}
