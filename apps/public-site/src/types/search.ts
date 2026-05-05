import type { PropertyType } from "./property";

export type PropertySort = "newest" | "price_asc" | "price_desc";

export interface PropertySearchParams {
  type?: PropertyType;
  prefecture?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  landAreaMin?: number;
  landAreaMax?: number;
  buildingAreaMin?: number;
  buildingAreaMax?: number;
  floorPlan?: string;
  features?: string[];
  sort?: PropertySort;
  page?: number;
  pageSize?: number;
}

export interface PropertySearchResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}