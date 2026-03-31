function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function shouldUseSameOriginProxy(base: string): boolean {
  if (!base) {
    return true;
  }

  try {
    const url = new URL(base);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

export function getBrowserApiBase(): string {
  const configured = trimTrailingSlash((process.env.NEXT_PUBLIC_API_BASE ?? "").trim());
  return shouldUseSameOriginProxy(configured) ? "" : configured;
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBrowserApiBase()}${normalizedPath}`;
}

export function getServerBackendBase(): string {
  const configured = trimTrailingSlash(
    (process.env.BACKEND_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000").trim(),
  );
  return configured || "http://127.0.0.1:8000";
}
