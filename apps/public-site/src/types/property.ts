export type PropertyType = "land" | "house";
export type PropertyStatus = "draft" | "published" | "archived";

export interface PropertyImage {
  id: string;
  url: string;
  alt?: string;
  sortOrder: number;
}

export interface PropertyLocation {
  prefecture: string;
  city: string;
  address1: string;
  address2?: string;
  nearestStation?: string;
  accessNote?: string;
  lat?: number;
  lng?: number;
}

export interface PropertyBase {
  id: string;
  slug: string;
  type: PropertyType;
  status: PropertyStatus;
  title: string;
  price: number; // 円で保持。表示時に万円へ整形してもOK
  description?: string;
  location: PropertyLocation;
  landAreaSqm?: number;
  images: PropertyImage[];
  features: string[];
  publishedAt?: string;
  updatedAt: string;
}

export interface HouseProperty extends PropertyBase {
  type: "house";
  buildingAreaSqm?: number;
  floorPlan?: string;
  buildingYear?: number;
  parking?: boolean;
  structure?: string;
}

export interface LandProperty extends PropertyBase {
  type: "land";
  buildingCoverageRatio?: number;
  floorAreaRatio?: number;
  landUseZone?: string;
  roadAccess?: string;
}

export type Property = HouseProperty | LandProperty;
export type PropertyDetail = Property;

export interface PropertyListItem {
  id: string;
  slug: string;
  type: PropertyType;
  title: string;
  price: number;
  thumbnailUrl?: string;
  prefecture: string;
  city: string;
  address1: string;
  nearestStation?: string;
  accessNote?: string;
  landAreaSqm?: number;
  buildingAreaSqm?: number;
  floorPlan?: string;
  features: string[];
  updatedAt: string;
}