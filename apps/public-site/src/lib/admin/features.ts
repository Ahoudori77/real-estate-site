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

function resolveErrorMessage(data: FeatureMutationResponse | ErrorResponse | null): string {
  if (!data || typeof data !== "object") {
    return "feature の保存に失敗しました。";
  }

  if ("error" in data && data.error?.message) {
    return data.error.message;
  }

  if ("message" in data && typeof data.message === "string") {
    return data.message;
  }

  return "feature の保存に失敗しました。";
}

export async function createFeature(
  input: AdminFeatureInput,
  apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL,
): Promise<FeatureMutationResponse> {
  if (!apiBaseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const response = await fetch(`${normalizedApiBaseUrl}/api/management/features`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  let data: FeatureMutationResponse | ErrorResponse | null = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as FeatureMutationResponse;
}

export async function updateFeature(
  id: string,
  input: AdminFeatureInput,
  apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL,
): Promise<FeatureMutationResponse> {
  if (!apiBaseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const response = await fetch(
    `${normalizedApiBaseUrl}/api/management/features/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  let data: FeatureMutationResponse | ErrorResponse | null = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as FeatureMutationResponse;
}

export async function deleteFeature(
  id: string,
  apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL,
): Promise<FeatureMutationResponse> {
  if (!apiBaseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const response = await fetch(
    `${normalizedApiBaseUrl}/api/management/features/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );

  let data: FeatureMutationResponse | ErrorResponse | null = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as FeatureMutationResponse;
}