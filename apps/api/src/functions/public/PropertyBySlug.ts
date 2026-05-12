import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSqlPool, sql } from "../../lib/sql";

type PropertyDetailRow = {
  id: string | number;
  slug: string;
  title: string;
  property_type: string;
  transaction_type: string;
  prefecture: string;
  city: string;
  address: string;
  price: number;
  land_area_sqm: number | null;
  building_area_sqm: number | null;
  layout: string | null;
  description: string;
  access_info: string | null;
  built_year: number | null;
  built_month: number | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  published_at: Date | null;
};

type PropertyImageRow = {
  id: string | number;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

type PropertyFeatureRow = {
  slug: string;
  name: string;
  category: string;
  sort_order: number;
};

export async function publicPropertyBySlug(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const routeSlug =
      request.params.slug ??
      decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");

    if (!routeSlug) {
      return {
        status: 400,
        jsonBody: {
          message: "slug is required.",
        },
      };
    }

    const pool = await getSqlPool();

    const propertyRequest = pool.request();
    propertyRequest.input("slug", sql.NVarChar(255), routeSlug);
    propertyRequest.input("status", sql.NVarChar(20), "published");

    const propertyResult = await propertyRequest.query<PropertyDetailRow>(`
      SELECT
        p.id,
        p.slug,
        p.title,
        p.property_type,
        p.transaction_type,
        p.prefecture,
        p.city,
        p.address,
        p.price,
        p.land_area_sqm,
        p.building_area_sqm,
        p.layout,
        p.description,
        p.access_info,
        p.built_year,
        p.built_month,
        p.latitude,
        p.longitude,
        p.status,
        p.published_at
      FROM dbo.properties p
      WHERE p.slug = @slug
        AND p.status = @status;
    `);

    const property = propertyResult.recordset[0];

    if (!property) {
      return {
        status: 404,
        jsonBody: {
          message: "Property not found.",
        },
      };
    }

    const imagesRequest = pool.request();
    imagesRequest.input("propertyId", sql.BigInt, property.id);

    const imagesResult = await imagesRequest.query<PropertyImageRow>(`
      SELECT
        id,
        image_url,
        alt_text,
        sort_order
      FROM dbo.property_images
      WHERE property_id = @propertyId
      ORDER BY sort_order, id;
    `);

    const featuresRequest = pool.request();
    featuresRequest.input("propertyId", sql.BigInt, property.id);

    const featuresResult = await featuresRequest.query<PropertyFeatureRow>(`
      SELECT
        f.slug,
        f.name,
        f.category,
        f.sort_order
      FROM dbo.property_features pf
      INNER JOIN dbo.features f
        ON pf.feature_id = f.id
      WHERE pf.property_id = @propertyId
      ORDER BY f.sort_order, f.id;
    `);

    return {
      status: 200,
      jsonBody: {
        id: String(property.id),
        slug: property.slug,
        title: property.title,
        propertyType: property.property_type,
        transactionType: property.transaction_type,
        prefecture: property.prefecture,
        city: property.city,
        address: property.address,
        price: property.price,
        landAreaSqm: property.land_area_sqm,
        buildingAreaSqm: property.building_area_sqm,
        layout: property.layout,
        description: property.description,
        accessInfo: property.access_info,
        builtYear: property.built_year,
        builtMonth: property.built_month,
        latitude: property.latitude === null ? null : Number(property.latitude),
        longitude: property.longitude === null ? null : Number(property.longitude),
        status: property.status,
        publishedAt: property.published_at,
        images: imagesResult.recordset.map((row) => ({
          id: String(row.id),
          imageUrl: row.image_url,
          altText: row.alt_text,
          sortOrder: row.sort_order,
        })),
        featureSlugs: featuresResult.recordset.map((row) => row.slug),
        features: featuresResult.recordset.map((row) => ({
          slug: row.slug,
          name: row.name,
          category: row.category,
          sortOrder: row.sort_order,
        })),
      },
    };
  } catch (error: unknown) {
    context.error("Failed to fetch property by slug.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch property.",
      },
    };
  }
}

app.http("publicPropertyBySlug", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "public/properties/{slug}",
  handler: publicPropertyBySlug,
});