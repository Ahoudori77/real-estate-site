import { mockProperties } from "../../data/mock/properties";
import type {
  PropertyDetail,
  PropertyListItem,
} from "../../types/property";
import type {
  PropertySearchParams,
  PropertySearchResult,
} from "../../types/search";
import { normalizePropertySearchParams } from "../search/query";

const DEFAULT_PAGE_SIZE = 12;
const CLIENT_SIDE_FETCH_PAGE_SIZE = 1000;

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
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const toBooleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
  }

  return undefined;
};

const getApiBaseUrl = () => {
  const baseUrl = import.meta.env.PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  return baseUrl.replace(/\/$/, "");
};

const buildUrl = (path: string, searchParams?: URLSearchParams) => {
  const url = new URL(`${getApiBaseUrl()}${path}`);

  if (searchParams) {
    url.search = searchParams.toString();
  }

  return url.toString();
};

const createSearchParams = (params: PropertySearchParams = {}) => {
  const searchParams = new URLSearchParams();

  if (params.type) searchParams.set("type", params.type);
  if (params.prefecture) searchParams.set("prefecture", params.prefecture);
  if (params.city) searchParams.set("city", params.city);
  if (params.priceMin !== undefined) {
    searchParams.set("priceMin", String(params.priceMin));
  }
  if (params.priceMax !== undefined) {
    searchParams.set("priceMax", String(params.priceMax));
  }
  if (params.landAreaMin !== undefined) {
    searchParams.set("landAreaMin", String(params.landAreaMin));
  }
  if (params.landAreaMax !== undefined) {
    searchParams.set("landAreaMax", String(params.landAreaMax));
  }
  if (params.buildingAreaMin !== undefined) {
    searchParams.set("buildingAreaMin", String(params.buildingAreaMin));
  }
  if (params.buildingAreaMax !== undefined) {
    searchParams.set("buildingAreaMax", String(params.buildingAreaMax));
  }
  if (params.floorPlan) searchParams.set("floorPlan", params.floorPlan);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.page !== undefined) searchParams.set("page", String(params.page));
  if (params.pageSize !== undefined) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  for (const feature of params.features ?? []) {
    searchParams.append("features", feature);
  }

  return searchParams;
};

const normalizeType = (value: unknown): "house" | "land" => {
  const raw = toStringValue(value)?.toLowerCase();

  if (raw === "land" || raw === "土地") {
    return "land";
  }

  return "house";
};

const normalizeFeatureName = (value: unknown): string | undefined => {
  if (typeof value === "string") return toStringValue(value);

  if (!isObject(value)) return undefined;

  return (
    toStringValue(value.name) ??
    toStringValue(value.label) ??
    toStringValue(value.featureName) ??
    toStringValue(value.feature_name) ??
    toStringValue(value.slug)
  );
};

const normalizeFeatures = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeFeatureName(item))
    .filter((item): item is string => Boolean(item));
};

const getFirstImageUrl = (value: unknown): string | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const firstImage = value[0];

  if (typeof firstImage === "string") {
    return toStringValue(firstImage);
  }

  if (!isObject(firstImage)) return undefined;

  return (
    toStringValue(firstImage.url) ??
    toStringValue(firstImage.imageUrl) ??
    toStringValue(firstImage.image_url)
  );
};

const normalizeImage = (value: unknown, index: number, fallbackAlt: string) => {
  if (!isObject(value)) {
    return {
      id: `image-${index + 1}`,
      url: "https://placehold.co/1200x800?text=Property",
      alt: fallbackAlt,
      sortOrder: index + 1,
    };
  }

  return {
    id: toStringValue(value.id) ?? `image-${index + 1}`,
    url:
      toStringValue(value.url) ??
      toStringValue(value.imageUrl) ??
      toStringValue(value.image_url) ??
      "https://placehold.co/1200x800?text=Property",
    alt:
      toStringValue(value.alt) ??
      toStringValue(value.altText) ??
      toStringValue(value.alt_text) ??
      toStringValue(value.title) ??
      fallbackAlt,
    sortOrder:
      toNumberValue(value.sortOrder) ??
      toNumberValue(value.sort_order) ??
      index + 1,
  };
};

const normalizeImages = (
  value: unknown,
  title: string,
  fallbackImageUrl?: string,
) => {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item, index) => normalizeImage(item, index, title));
  }

  return [
    {
      id: "image-1",
      url: fallbackImageUrl ?? "https://placehold.co/1200x800?text=Property",
      alt: title,
      sortOrder: 1,
    },
  ];
};

const normalizeLocation = (value: unknown, parentValue?: unknown) => {
  const raw = isObject(value) ? value : {};
  const parent = isObject(parentValue) ? parentValue : {};

  return {
    prefecture:
      toStringValue(raw.prefecture) ??
      toStringValue(parent.prefecture) ??
      "",
    city:
      toStringValue(raw.city) ??
      toStringValue(parent.city) ??
      "",
    address1:
      toStringValue(raw.address1) ??
      toStringValue(raw.address_1) ??
      toStringValue(raw.address) ??
      toStringValue(parent.address1) ??
      toStringValue(parent.address_1) ??
      toStringValue(parent.address) ??
      "",
    address2:
      toStringValue(raw.address2) ??
      toStringValue(raw.address_2) ??
      toStringValue(parent.address2) ??
      toStringValue(parent.address_2),
    nearestStation:
      toStringValue(raw.nearestStation) ??
      toStringValue(raw.nearest_station) ??
      toStringValue(parent.nearestStation) ??
      toStringValue(parent.nearest_station),
    accessNote:
      toStringValue(raw.accessNote) ??
      toStringValue(raw.access_note) ??
      toStringValue(parent.accessInfo) ??
      toStringValue(parent.access_info),
    lat: toNumberValue(raw.lat) ?? toNumberValue(parent.lat),
    lng: toNumberValue(raw.lng) ?? toNumberValue(parent.lng),
  };
};

const normalizePropertyListItem = (value: unknown): PropertyListItem => {
  const raw = isObject(value) ? value : {};
  const location = normalizeLocation(raw.location, raw);
  const features = normalizeFeatures(raw.features);

  return {
    id: toStringValue(raw.id) ?? "",
    slug: toStringValue(raw.slug) ?? "",
    type: normalizeType(raw.type ?? raw.propertyType ?? raw.property_type),
    title: toStringValue(raw.title) ?? "物件名未設定",
    price: toNumberValue(raw.price) ?? 0,
    thumbnailUrl:
      toStringValue(raw.thumbnailUrl) ??
      toStringValue(raw.thumbnail_url) ??
      toStringValue(raw.imageUrl) ??
      toStringValue(raw.image_url) ??
      getFirstImageUrl(raw.images) ??
      undefined,
    prefecture: location.prefecture,
    city: location.city,
    address1: location.address1,
    nearestStation: location.nearestStation,
    accessNote: location.accessNote,
    landAreaSqm:
      toNumberValue(raw.landAreaSqm) ??
      toNumberValue(raw.land_area_sqm) ??
      0,
    buildingAreaSqm:
      toNumberValue(raw.buildingAreaSqm) ??
      toNumberValue(raw.building_area_sqm),
    floorPlan:
      toStringValue(raw.floorPlan) ??
      toStringValue(raw.floor_plan) ??
      toStringValue(raw.layout),
    features,
    updatedAt:
      toStringValue(raw.updatedAt) ??
      toStringValue(raw.updated_at) ??
      toStringValue(raw.publishedAt) ??
      toStringValue(raw.published_at) ??
      "",
  };
};

const normalizePropertyDetail = (value: unknown): PropertyDetail => {
  const raw = isObject(value) ? value : {};
  const title = toStringValue(raw.title) ?? "物件名未設定";
  const location = normalizeLocation(raw.location, raw);
  const features = normalizeFeatures(raw.features);
  const fallbackImageUrl =
    toStringValue(raw.thumbnailUrl) ??
    toStringValue(raw.thumbnail_url) ??
    toStringValue(raw.imageUrl) ??
    toStringValue(raw.image_url) ??
    getFirstImageUrl(raw.images);

  const images = normalizeImages(raw.images, title, fallbackImageUrl);

  return {
    id: toStringValue(raw.id) ?? "",
    slug: toStringValue(raw.slug) ?? "",
    type: normalizeType(raw.type ?? raw.propertyType ?? raw.property_type),
    status: toStringValue(raw.status) ?? "published",
    title,
    price: toNumberValue(raw.price) ?? 0,
    description:
      toStringValue(raw.description) ?? "物件詳細はお問い合わせください。",
    location,
    landAreaSqm:
      toNumberValue(raw.landAreaSqm) ??
      toNumberValue(raw.land_area_sqm) ??
      0,
    buildingAreaSqm:
      toNumberValue(raw.buildingAreaSqm) ??
      toNumberValue(raw.building_area_sqm),
    floorPlan:
      toStringValue(raw.floorPlan) ??
      toStringValue(raw.floor_plan) ??
      toStringValue(raw.layout),
    buildingYear:
      toNumberValue(raw.buildingYear) ??
      toNumberValue(raw.building_year) ??
      toNumberValue(raw.builtYear) ??
      toNumberValue(raw.built_year),
    parking: toBooleanValue(raw.parking),
    structure: toStringValue(raw.structure),
    buildingCoverageRatio:
      toNumberValue(raw.buildingCoverageRatio) ??
      toNumberValue(raw.building_coverage_ratio),
    floorAreaRatio:
      toNumberValue(raw.floorAreaRatio) ??
      toNumberValue(raw.floor_area_ratio),
    landUseZone:
      toStringValue(raw.landUseZone) ?? toStringValue(raw.land_use_zone),
    roadAccess:
      toStringValue(raw.roadAccess) ?? toStringValue(raw.road_access),
    features,
    images,
    publishedAt:
      toStringValue(raw.publishedAt) ??
      toStringValue(raw.published_at) ??
      "",
    updatedAt:
      toStringValue(raw.updatedAt) ??
      toStringValue(raw.updated_at) ??
      toStringValue(raw.publishedAt) ??
      toStringValue(raw.published_at) ??
      "",
  } as PropertyDetail;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
};

const getTimeValue = (value: string | undefined): number => {
  if (!value) return 0;

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
};

const matchesSearchParams = (
  property: PropertyListItem,
  params: PropertySearchParams,
): boolean => {
  if (params.type && property.type !== params.type) {
    return false;
  }

  if (params.prefecture && property.prefecture !== params.prefecture) {
    return false;
  }

  if (params.city && property.city !== params.city) {
    return false;
  }

  if (params.priceMin !== undefined && property.price < params.priceMin) {
    return false;
  }

  if (params.priceMax !== undefined && property.price > params.priceMax) {
    return false;
  }

  if (
    params.landAreaMin !== undefined &&
    property.landAreaSqm < params.landAreaMin
  ) {
    return false;
  }

  if (
    params.landAreaMax !== undefined &&
    property.landAreaSqm > params.landAreaMax
  ) {
    return false;
  }

  if (params.buildingAreaMin !== undefined) {
    if (
      property.buildingAreaSqm === undefined ||
      property.buildingAreaSqm < params.buildingAreaMin
    ) {
      return false;
    }
  }

  if (params.buildingAreaMax !== undefined) {
    if (
      property.buildingAreaSqm === undefined ||
      property.buildingAreaSqm > params.buildingAreaMax
    ) {
      return false;
    }
  }

  if (params.floorPlan && property.floorPlan !== params.floorPlan) {
    return false;
  }

  if (params.features && params.features.length > 0) {
    const propertyFeatures = new Set(property.features);

    const hasAllSelectedFeatures = params.features.every((feature) =>
      propertyFeatures.has(feature),
    );

    if (!hasAllSelectedFeatures) {
      return false;
    }
  }

  return true;
};

const sortProperties = (
  properties: PropertyListItem[],
  sort: PropertySearchParams["sort"],
): PropertyListItem[] => {
  const sorted = [...properties];

  switch (sort) {
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price);
      break;

    case "price_desc":
      sorted.sort((a, b) => b.price - a.price);
      break;

    case "newest":
    default:
      sorted.sort((a, b) => getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt));
      break;
  }

  return sorted;
};

const createSearchResultFromItems = (
  items: PropertyListItem[],
  params: PropertySearchParams = {},
): PropertySearchResult<PropertyListItem> => {
  const normalizedParams = normalizePropertySearchParams(params);
  const page = normalizedParams.page ?? 1;
  const pageSize = normalizedParams.pageSize ?? DEFAULT_PAGE_SIZE;

  const filteredItems = items.filter((property) =>
    matchesSearchParams(property, normalizedParams),
  );

  const sortedItems = sortProperties(filteredItems, normalizedParams.sort);

  const total = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pagedItems = sortedItems.slice(start, start + pageSize);

  return {
    items: pagedItems,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
};

const normalizePropertyItemsPayload = (data: unknown): PropertyListItem[] => {
  const rawItems =
    isObject(data) && Array.isArray(data.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

  return rawItems.map((item) => normalizePropertyListItem(item));
};

const getMockPropertyItems = (): PropertyListItem[] => {
  return mockProperties
    .filter((property) => property.status === "published")
    .map((property) => normalizePropertyListItem(property));
};

const fetchPropertyItemsForClientSideSearch = async (
  params: PropertySearchParams = {},
): Promise<PropertyListItem[]> => {
  const searchParams = createSearchParams({
    ...params,
    page: 1,
    pageSize: CLIENT_SIDE_FETCH_PAGE_SIZE,
  });

  const url = buildUrl("/api/public/properties", searchParams);
  const data = await fetchJson<unknown>(url);

  return normalizePropertyItemsPayload(data);
};

export const getProperties = async (
  params: PropertySearchParams = {},
): Promise<PropertySearchResult<PropertyListItem>> => {
  try {
    const items = await fetchPropertyItemsForClientSideSearch(params);
    return createSearchResultFromItems(items, params);
  } catch {
    const items = getMockPropertyItems();
    return createSearchResultFromItems(items, params);
  }
};

export const getPropertyBySlug = async (
  slug: string,
): Promise<PropertyDetail | null> => {
  try {
    const url = buildUrl(`/api/public/properties/${encodeURIComponent(slug)}`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as unknown;
    return normalizePropertyDetail(data);
  } catch {
    const property = mockProperties.find(
      (item) => item.slug === slug && item.status === "published",
    );

    return property ? normalizePropertyDetail(property) : null;
  }
};

export const getRelatedProperties = async (
  currentProperty: PropertyDetail,
  limit = 3,
): Promise<PropertyListItem[]> => {
  const firstPage = await getProperties({
    type: currentProperty.type,
    sort: "newest",
    page: 1,
    pageSize: Math.max(limit + 8, 12),
  });

  return firstPage.items
    .filter((item) => item.slug !== currentProperty.slug)
    .slice(0, limit);
};

export const getPropertySlugs = async (): Promise<string[]> => {
  const firstPage = await getProperties({
    page: 1,
    pageSize: 100,
    sort: "newest",
  });

  const allItems = [...firstPage.items];

  if (firstPage.totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
        getProperties({
          page: index + 2,
          pageSize: 100,
          sort: "newest",
        }),
      ),
    );

    for (const page of remainingPages) {
      allItems.push(...page.items);
    }
  }

  return allItems
    .map((item) => item.slug)
    .filter((slug): slug is string => Boolean(slug));
};