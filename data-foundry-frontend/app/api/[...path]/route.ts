import { NextRequest, NextResponse } from "next/server";
import { getServerBackendBase } from "@/lib/api-base";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, path: string[]) {
  const backendBase = getServerBackendBase();
  const targetUrl = `${backendBase}/api/${path.join("/")}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
    redirect: "manual",
  };

  const response = await fetch(targetUrl, init);
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
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
