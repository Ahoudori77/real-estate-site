import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

type WorkerEnv = {
  AZURE_FUNCTIONS_BASE_URL?: string;
  AZURE_FUNCTIONS_MANAGEMENT_KEY?: string;
};

const workerEnv = env as WorkerEnv;

async function proxyToManagementApi({
  params,
  request,
}: Parameters<APIRoute>[0]): Promise<Response> {
  const baseUrl = workerEnv.AZURE_FUNCTIONS_BASE_URL;
  const managementKey = workerEnv.AZURE_FUNCTIONS_MANAGEMENT_KEY;

  if (!baseUrl) {
    return json({ ok: false, error: "AZURE_FUNCTIONS_BASE_URL is not set" }, 500);
  }

  if (!managementKey) {
    return json({ ok: false, error: "AZURE_FUNCTIONS_MANAGEMENT_KEY is not set" }, 500);
  }

  const path = params.path ?? "";
  const requestUrl = new URL(request.url);

  const targetUrl = new URL(
    `${baseUrl.replace(/\/$/, "")}/api/management/${path}`,
  );

  targetUrl.search = requestUrl.search;

  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("content-length");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-proto");

  headers.set("x-functions-key", managementKey);

  const method = request.method.toUpperCase();

  const response = await fetch(targetUrl.toString(), {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
  });

  const responseHeaders = new Headers(response.headers);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export const GET: APIRoute = proxyToManagementApi;
export const POST: APIRoute = proxyToManagementApi;
export const PATCH: APIRoute = proxyToManagementApi;
export const DELETE: APIRoute = proxyToManagementApi;
