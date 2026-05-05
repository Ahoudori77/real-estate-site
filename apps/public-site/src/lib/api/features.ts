export type PublicFeatureOption = {
  id: string;
  slug: string;
  name: string;
  category?: string;
  sortOrder?: number;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
};

const toNumberValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const getApiBaseUrl = (): string => {
  const baseUrl = import.meta.env.PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  return baseUrl.replace(/\/$/, "");
};

const buildUrl = (path: string): string => {
  return `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
};

const normalizeFeature = (value: unknown): PublicFeatureOption | null => {
  if (!isObject(value)) return null;

  const id =
    toStringValue(value.id) ??
    toStringValue(value.featureId) ??
    toStringValue(value.feature_id);

  const slug = toStringValue(value.slug);
  const name =
    toStringValue(value.name) ??
    toStringValue(value.label) ??
    toStringValue(value.featureName) ??
    toStringValue(value.feature_name);

  if (!slug || !name) return null;

  return {
    id: id ?? slug,
    slug,
    name,
    category: toStringValue(value.category),
    sortOrder: toNumberValue(value.sortOrder ?? value.sort_order),
  };
};

const normalizeFeaturePayload = (payload: unknown): PublicFeatureOption[] => {
  const rawItems = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.items)
      ? payload.items
      : isObject(payload) && Array.isArray(payload.data)
        ? payload.data
        : isObject(payload) && Array.isArray(payload.results)
          ? payload.results
          : [];

  return rawItems
    .map((item) => normalizeFeature(item))
    .filter((item): item is PublicFeatureOption => item !== null)
    .sort((a, b) => {
      const sortA = a.sortOrder ?? 0;
      const sortB = b.sortOrder ?? 0;

      if (sortA !== sortB) return sortA - sortB;

      return a.name.localeCompare(b.name, "ja");
    });
};

export const getPublicFeatureOptions = async (): Promise<PublicFeatureOption[]> => {
  const response = await fetch(buildUrl("/api/public/features"), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch public features: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as unknown;
  return normalizeFeaturePayload(payload);
};
