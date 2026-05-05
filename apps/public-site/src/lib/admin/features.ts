export type AdminFeatureInput = {
  slug: string;
  name: string;
  category: string;
  sortOrder: number;
};

type FeatureMutationResponse = {
  id?: string;
  slug?: string;
  message?: string;
  [key: string]: unknown;
};

type ErrorResponse = {
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

function buildAdminApiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function resolveErrorMessage(data: FeatureMutationResponse | ErrorResponse | null): string {
  if (!data || typeof data !== "object") {
    return "こだわり条件の保存に失敗しました。";
  }

  if ("error" in data && data.error?.message) {
    return data.error.message;
  }

  if ("message" in data && typeof data.message === "string") {
    return data.message;
  }

  return "こだわり条件の保存に失敗しました。";
}

async function readResponseJson(
  response: Response,
): Promise<FeatureMutationResponse | ErrorResponse | null> {
  try {
    return (await response.json()) as FeatureMutationResponse | ErrorResponse;
  } catch {
    return null;
  }
}

export async function createFeature(
  input: AdminFeatureInput,
): Promise<FeatureMutationResponse> {
  const response = await fetch(buildAdminApiUrl("/api/admin/features"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as FeatureMutationResponse;
}

export async function updateFeature(
  id: string,
  input: AdminFeatureInput,
): Promise<FeatureMutationResponse> {
  const response = await fetch(
    buildAdminApiUrl(`/api/admin/features/${encodeURIComponent(id)}`),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as FeatureMutationResponse;
}

export async function deleteFeature(
  id: string,
): Promise<FeatureMutationResponse> {
  const response = await fetch(
    buildAdminApiUrl(`/api/admin/features/${encodeURIComponent(id)}`),
    {
      method: "DELETE",
    },
  );

  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as FeatureMutationResponse;
}