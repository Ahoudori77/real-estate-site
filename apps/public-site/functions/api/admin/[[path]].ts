type Env = {
  AZURE_FUNCTIONS_BASE_URL: string;
  AZURE_FUNCTIONS_MANAGEMENT_KEY: string;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.AZURE_FUNCTIONS_BASE_URL) {
    return json({ ok: false, error: "AZURE_FUNCTIONS_BASE_URL is not set" }, 500);
  }

  if (!env.AZURE_FUNCTIONS_MANAGEMENT_KEY) {
    return json({ ok: false, error: "AZURE_FUNCTIONS_MANAGEMENT_KEY is not set" }, 500);
  }

  const pathParam = params.path;

  const path = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";

  const requestUrl = new URL(request.url);

  const baseUrl = env.AZURE_FUNCTIONS_BASE_URL.replace(/\/$/, "");
  const targetUrl = new URL(`${baseUrl}/api/management/${path}`);
  targetUrl.search = requestUrl.search;

  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("content-length");

  headers.set("x-functions-key", env.AZURE_FUNCTIONS_MANAGEMENT_KEY);

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
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}