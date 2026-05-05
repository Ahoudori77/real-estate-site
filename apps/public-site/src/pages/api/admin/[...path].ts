import type { APIRoute } from "astro";

export const prerender = false;

type CloudflareRuntime = {
  env?: {
    AZURE_FUNCTIONS_BASE_URL?: string;
    AZURE_FUNCTIONS_MANAGEMENT_KEY?: string;
  };
};

function getEnv(locals: App.Locals): CloudflareRuntime["env"] {
  return (locals as App.Locals & { runtime?: CloudflareRuntime }).runtime?.env;
}

async function proxyToManagementApi({
  params,
  request,
  locals,
}: Parameters<APIRoute>[0]): Promise<Response> {
  const env = getEnv(locals);

  const baseUrl = env?.AZURE_FUNCTIONS_BASE_URL;
  const managementKey = env?.AZURE_FUNCTIONS_MANAGEMENT_KEY;

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
