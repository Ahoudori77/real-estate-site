import { formatArea, formatPriceToManYen } from "../utils/format";
import type { PropertySearchParams, PropertySort } from "../../types/search";
import type { PropertyType } from "../../types/property";

export const DEFAULT_PROPERTY_SORT: PropertySort = "newest";
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 12;

const readString = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readNumber = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readPropertyType = (value: string | null): PropertyType | undefined => {
  return value === "land" || value === "house" ? value : undefined;
};

const readSort = (value: string | null): PropertySort | undefined => {
  return value === "newest" || value === "price_asc" || value === "price_desc"
    ? value
    : undefined;
};

const readFeatures = (searchParams: URLSearchParams): string[] | undefined => {
  const repeatedValues = searchParams.getAll("features");
  const values = repeatedValues.flatMap((value) => value.split(","));

  const normalized = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );

  return normalized.length > 0 ? normalized : undefined;
};

export const parsePropertySearchParams = (
  searchParams: URLSearchParams,
): PropertySearchParams => {
  return {
    type: readPropertyType(searchParams.get("type")),
    prefecture: readString(searchParams.get("prefecture")),
    city: readString(searchParams.get("city")),
    priceMin: readNumber(searchParams.get("priceMin")),
    priceMax: readNumber(searchParams.get("priceMax")),
    landAreaMin: readNumber(searchParams.get("landAreaMin")),
    landAreaMax: readNumber(searchParams.get("landAreaMax")),
    buildingAreaMin: readNumber(searchParams.get("buildingAreaMin")),
    buildingAreaMax: readNumber(searchParams.get("buildingAreaMax")),
    floorPlan: readString(searchParams.get("floorPlan")),
    features: readFeatures(searchParams),
    sort: readSort(searchParams.get("sort")),
    page: readNumber(searchParams.get("page")),
    pageSize: readNumber(searchParams.get("pageSize")),
  };
};

export const normalizePropertySearchParams = (
  params: PropertySearchParams = {},
): PropertySearchParams => {
  const normalizedPage =
    params.page && params.page > 0 ? Math.floor(params.page) : DEFAULT_PAGE;

  const normalizedPageSize =
    params.pageSize && params.pageSize > 0
      ? Math.floor(params.pageSize)
      : DEFAULT_PAGE_SIZE;

  const normalizedFeatures = Array.from(
    new Set((params.features ?? []).map((feature) => feature.trim()).filter(Boolean)),
  );

  return {
    type: params.type,
    prefecture: params.prefecture?.trim() || undefined,
    city: params.city?.trim() || undefined,
    priceMin:
      params.priceMin !== undefined && params.priceMin >= 0
        ? params.priceMin
        : undefined,
    priceMax:
      params.priceMax !== undefined && params.priceMax >= 0
        ? params.priceMax
        : undefined,
    landAreaMin:
      params.landAreaMin !== undefined && params.landAreaMin >= 0
        ? params.landAreaMin
        : undefined,
    landAreaMax:
      params.landAreaMax !== undefined && params.landAreaMax >= 0
        ? params.landAreaMax
        : undefined,
    buildingAreaMin:
      params.buildingAreaMin !== undefined && params.buildingAreaMin >= 0
        ? params.buildingAreaMin
        : undefined,
    buildingAreaMax:
      params.buildingAreaMax !== undefined && params.buildingAreaMax >= 0
        ? params.buildingAreaMax
        : undefined,
    floorPlan: params.floorPlan?.trim() || undefined,
    features: normalizedFeatures.length > 0 ? normalizedFeatures : undefined,
    sort: params.sort ?? DEFAULT_PROPERTY_SORT,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
};

interface CreateQueryOptions {
  includeDefaults?: boolean;
}

export const createPropertySearchQuery = (
  params: PropertySearchParams,
  options: CreateQueryOptions = {},
): string => {
  const { includeDefaults = false } = options;
  const normalized = normalizePropertySearchParams(params);
  const searchParams = new URLSearchParams();

  if (normalized.type) searchParams.set("type", normalized.type);
  if (normalized.prefecture) searchParams.set("prefecture", normalized.prefecture);
  if (normalized.city) searchParams.set("city", normalized.city);
  if (normalized.priceMin !== undefined) {
    searchParams.set("priceMin", String(normalized.priceMin));
  }
  if (normalized.priceMax !== undefined) {
    searchParams.set("priceMax", String(normalized.priceMax));
  }
  if (normalized.landAreaMin !== undefined) {
    searchParams.set("landAreaMin", String(normalized.landAreaMin));
  }
  if (normalized.landAreaMax !== undefined) {
    searchParams.set("landAreaMax", String(normalized.landAreaMax));
  }
  if (normalized.buildingAreaMin !== undefined) {
    searchParams.set("buildingAreaMin", String(normalized.buildingAreaMin));
  }
  if (normalized.buildingAreaMax !== undefined) {
    searchParams.set("buildingAreaMax", String(normalized.buildingAreaMax));
  }
  if (normalized.floorPlan) searchParams.set("floorPlan", normalized.floorPlan);

  if (normalized.sort && (includeDefaults || normalized.sort !== DEFAULT_PROPERTY_SORT)) {
    searchParams.set("sort", normalized.sort);
  }

  if (
    normalized.page !== undefined &&
    (includeDefaults || normalized.page !== DEFAULT_PAGE)
  ) {
    searchParams.set("page", String(normalized.page));
  }

  if (
    normalized.pageSize !== undefined &&
    (includeDefaults || normalized.pageSize !== DEFAULT_PAGE_SIZE)
  ) {
    searchParams.set("pageSize", String(normalized.pageSize));
  }

  for (const feature of normalized.features ?? []) {
    searchParams.append("features", feature);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

export const buildPropertiesHref = (
  params: PropertySearchParams = {},
  options?: CreateQueryOptions,
): string => {
  return `/properties${createPropertySearchQuery(params, options)}`;
};

export const buildSearchHref = (
  params: PropertySearchParams = {},
  options?: CreateQueryOptions,
): string => {
  return `/search${createPropertySearchQuery(params, options)}`;
};

type FeatureLabelMap = Record<string, string>;

export const getActiveFilterLabels = (
  params: PropertySearchParams,
  featureLabelMap: FeatureLabelMap = {},
): string[] => {
  const labels: string[] = [];

  if (params.type === "land") labels.push("物件種別: 土地");
  if (params.type === "house") labels.push("物件種別: 戸建て");
  if (params.prefecture) labels.push(`都道府県: ${params.prefecture}`);
  if (params.city) labels.push(`市区町村: ${params.city}`);
  if (params.priceMin !== undefined) {
    labels.push(`価格下限: ${formatPriceToManYen(params.priceMin)}`);
  }
  if (params.priceMax !== undefined) {
    labels.push(`価格上限: ${formatPriceToManYen(params.priceMax)}`);
  }
  if (params.landAreaMin !== undefined) {
    labels.push(`土地面積下限: ${formatArea(params.landAreaMin)}`);
  }
  if (params.landAreaMax !== undefined) {
    labels.push(`土地面積上限: ${formatArea(params.landAreaMax)}`);
  }
  if (params.buildingAreaMin !== undefined) {
    labels.push(`建物面積下限: ${formatArea(params.buildingAreaMin)}`);
  }
  if (params.buildingAreaMax !== undefined) {
    labels.push(`建物面積上限: ${formatArea(params.buildingAreaMax)}`);
  }
  if (params.floorPlan) labels.push(`間取り: ${params.floorPlan}`);
  for (const feature of params.features ?? []) {
    labels.push(`条件: ${featureLabelMap[feature] ?? feature}`);
  }

  return labels;
};