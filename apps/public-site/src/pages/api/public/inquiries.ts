import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

type WorkerEnv = {
  AZURE_FUNCTIONS_BASE_URL?: string;
};

const workerEnv = env as WorkerEnv;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function proxyToPublicInquiryApi({
  request,
}: Parameters<APIRoute>[0]): Promise<Response> {
  const baseUrl = workerEnv.AZURE_FUNCTIONS_BASE_URL;

  if (!baseUrl) {
    return json({ ok: false, error: "AZURE_FUNCTIONS_BASE_URL is not set" }, 500);
  }

  const requestUrl = new URL(request.url);
  const targetUrl = new URL(
    `${baseUrl.replace(/\/$/, "")}/api/public/inquiries`,
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

  const method = request.method.toUpperCase();

  const response = await fetch(targetUrl.toString(), {
    method,
    headers,
    body: method === "GET" || method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
  });

  const responseHeaders = new Headers(response.headers);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const POST: APIRoute = proxyToPublicInquiryApi;

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
  });
};
