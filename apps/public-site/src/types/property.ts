export type PropertyType = "land" | "house";
export type PropertyStatus = "draft" | "published" | "archived";
export type PropertyPriceType = "fixed" | "consultation";
export type PropertyTransactionType = "seller" | "brokerage";

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
  propertyNumber?: string;
  type: PropertyType;
  status: PropertyStatus;
  title: string;
  priceType?: PropertyPriceType;
  price: number | null;
  transactionType?: PropertyTransactionType;
  description?: string;
  location: PropertyLocation;
  landAreaSqm?: number | null;
  images: PropertyImage[];
  features: string[];
  publishedAt?: string;
  updatedAt: string;

  landCategory?: string | null;
  cityPlanningArea?: string | null;
  zoningDistrict?: string | null;
  landUseZone?: string | null;
  buildingCoverageRatio?: number | null;
  floorAreaRatio?: number | null;
  roadAccess?: string | null;

  currentStatus?: string | null;
  handoverTiming?: string | null;
  facilities?: string | null;
  remarks?: string | null;
}

export interface HouseProperty extends PropertyBase {
  type: "house";
  buildingAreaSqm?: number | null;
  floorPlan?: string | null;
  builtYear?: number | null;
  builtMonth?: number | null;
  buildingYear?: number | null;
  buildingMonth?: number | null;
  buildingStructure?: string | null;
  buildingFloors?: string | null;
  parking?: string | boolean | null;
  structure?: string | null;
}

export interface LandProperty extends PropertyBase {
  type: "land";
}

export type Property = HouseProperty | LandProperty;
export type PropertyDetail = Property;

export interface PropertyListItem {
  id: string;
  slug: string;
  propertyNumber?: string;
  type: PropertyType;
  title: string;
  priceType?: PropertyPriceType;
  price: number | null;
  transactionType?: PropertyTransactionType;
  thumbnailUrl?: string;
  prefecture: string;
  city: string;
  address1: string;
  nearestStation?: string;
  accessNote?: string;
  landAreaSqm?: number | null;
  buildingAreaSqm?: number | null;
  floorPlan?: string | null;
  features: string[];
  updatedAt: string;

  landCategory?: string | null;
  cityPlanningArea?: string | null;
  zoningDistrict?: string | null;
  landUseZone?: string | null;
  buildingCoverageRatio?: number | null;
  floorAreaRatio?: number | null;
  roadAccess?: string | null;

  buildingStructure?: string | null;
  buildingFloors?: string | null;
  parking?: string | boolean | null;
  currentStatus?: string | null;
  handoverTiming?: string | null;
  facilities?: string | null;
  remarks?: string | null;
}