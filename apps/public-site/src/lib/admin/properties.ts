type AdminPropertyBaseInput = {
  title: string;
  propertyType: "land" | "house";
  transactionType: "sale";
  prefecture: string;
  city: string;
  address: string;
  price: number;
  landAreaSqm: number | null;
  buildingAreaSqm: number | null;
  layout: string | null;
  description: string;
  accessInfo: string | null;
  builtYear: number | null;
  builtMonth: number | null;
  status: "draft" | "published" | "archived";
};

export type AdminPropertyCreateInput = AdminPropertyBaseInput & {
  slug: string;
};

export type AdminPropertyUpdateInput = AdminPropertyBaseInput & {
  featureIds: string[];
};

type AdminPropertyMutationResponse = {
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

function resolveErrorMessage(data: AdminPropertyMutationResponse | ErrorResponse | null): string {
  if (!data || typeof data !== "object") {
    return "物件の保存に失敗しました。";
  }

  if ("error" in data && data.error?.message) {
    return data.error.message;
  }

  if ("message" in data && typeof data.message === "string") {
    return data.message;
  }

  return "物件の保存に失敗しました。";
}

export async function createProperty(
  input: AdminPropertyCreateInput,
  apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL,
): Promise<AdminPropertyMutationResponse> {
  if (!apiBaseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const response = await fetch(`${normalizedApiBaseUrl}/api/management/properties`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  let data: AdminPropertyMutationResponse | ErrorResponse | null = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as AdminPropertyMutationResponse;
}

export async function updateProperty(
  slug: string,
  input: AdminPropertyUpdateInput,
  apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL,
): Promise<AdminPropertyMutationResponse> {
  if (!apiBaseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const response = await fetch(
    `${normalizedApiBaseUrl}/api/management/properties/${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  let data: AdminPropertyMutationResponse | ErrorResponse | null = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return (data ?? {}) as AdminPropertyMutationResponse;
}