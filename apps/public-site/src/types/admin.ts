export type AdminPropertyListItem = {
  id?: string;
  slug: string;
  title: string;
  propertyType?: string;
  transactionType?: string;
  prefecture?: string;
  city?: string;
  price?: number | null;
  status?: string;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
};

export type AdminFeatureListItem = {
  id?: string;
  slug: string;
  name: string;
  category?: string;
  sortOrder?: number;
};

export type AdminInquiryListItem = {
  id?: string;
  propertySlug?: string | null;
  propertyTitle?: string | null;
  propertyNumber?: string | null;
  name?: string;
  email?: string;
  phone?: string | null;
  message?: string;
  status?: string;
  createdAt?: string | null;
};

export type AdminPropertyDetail = {
  id: string;
  slug: string;
  title: string;
  propertyType: string;
  transactionType: string;
  prefecture: string;
  city: string;
  address: string;
  price?: number | null;  
  priceType?: string;
  propertyNumber?: string;
  landAreaSqm?: number | null;
  buildingAreaSqm?: number | null;
  layout?: string | null;
  description: string;
  accessInfo?: string | null;
  builtYear?: number | null;
  builtMonth?: number | null;
  status: string;
  publishedAt?: string | null;
  images: Array<{
    id: string;
    imageUrl: string;
    altText?: string | null;
    sortOrder: number;
  }>;
  featureSlugs: string[];
  features: Array<{
    slug: string;
    name: string;
    category: string;
    sortOrder: number;
  }>;
};

export type ManagementFeature = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
};

export type ManagementPropertyDetail = {
  id: string;
  slug: string;
  title: string;
  price: number | null;
  status: "draft" | "published";
  prefecture?: string;
  city?: string;
  address?: string;
  description?: string;
  propertyType?: string;
  featuredImageUrl?: string | null;
  updatedAt?: string;
  featureIds: string[];
};
export type AdminImageCleanupCandidate = {
  blobName: string;
  imageUrl: string;
  contentType: string | null;
  size: number;
  lastModified: string;
  ageDays: number;
};

export type AdminImageCleanupScanResponse = {
  dryRun: true;
  containerName: string;
  minAgeDays: number;
  scannedBlobCount: number;
  referencedBlobCount: number;
  recentUnreferencedCount: number;
  candidateCount: number;
  candidateTotalSize: number;
  candidates: AdminImageCleanupCandidate[];
};

export type AdminImageCleanupDeleteResult = {
  blobName: string;
  status: "deleted" | "skipped" | "failed";
  reason?: string;
};

export type AdminImageCleanupDeleteResponse = {
  minAgeDays: number;
  requestedCount: number;
  deletedCount: number;
  skippedCount: number;
  failedCount: number;
  results: AdminImageCleanupDeleteResult[];
};
