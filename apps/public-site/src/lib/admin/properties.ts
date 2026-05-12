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
  latitude?: number | null;
  longitude?: number | null;
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

function buildAdminApiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

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
): Promise<AdminPropertyMutationResponse> {
  const response = await fetch(buildAdminApiUrl("/api/admin/properties"), {
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
): Promise<AdminPropertyMutationResponse> {
  const response = await fetch(
    buildAdminApiUrl(`/api/admin/properties/${encodeURIComponent(slug)}`),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
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