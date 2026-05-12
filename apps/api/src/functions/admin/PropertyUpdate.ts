import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { sql, getSqlPool } from "../../lib/sql";
import {
  assertFeatureIdsExist,
  getFeatureIdsByPropertyId,
  replacePropertyFeatures,
} from "../../lib/property-features";

const patchManagementPropertySchema = z.object({
  title: z.string().min(1),
  propertyType: z.enum(["land", "house"]),
  transactionType: z.literal("sale"),
  prefecture: z.string(),
  city: z.string(),
  address: z.string(),
  price: z.number(),
  landAreaSqm: z.number().nullable(),
  buildingAreaSqm: z.number().nullable(),
  layout: z.string().nullable(),
  description: z.string(),
  accessInfo: z.string().nullable(),
  builtYear: z.number().int().nullable(),
  builtMonth: z.number().int().nullable(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  featureIds: z.array(z.string()).optional(),
});

function mapManagementProperty(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    price: row.price === null ? null : Number(row.price),
    status: row.status,
    prefecture: row.prefecture,
    city: row.city,
    address: row.address,
    description: row.description,
    propertyType: row.property_type,
    transactionType: row.transaction_type,
    landAreaSqm: row.land_area_sqm === null ? null : Number(row.land_area_sqm),
    buildingAreaSqm: row.building_area_sqm === null ? null : Number(row.building_area_sqm),
    layout: row.layout,
    accessInfo: row.access_info,
    builtYear: row.built_year,
    builtMonth: row.built_month,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    updatedAt: row.updated_at,
  };
}

export async function patchManagementPropertyBySlug(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const slug = request.params.slug;

  if (!slug) {
    return {
      status: 400,
      jsonBody: {
        message: "Slug is required.",
      },
    };
  }

  try {
    const body = await request.json();
    const parsed = patchManagementPropertySchema.safeParse(body);

    if (!parsed.success) {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid request body.",
          errors: parsed.error.flatten(),
        },
      };
    }

    const input = parsed.data;
    const pool = await getSqlPool();

    const existingResult = await pool.request()
      .input("slug", sql.NVarChar, slug)
      .query(`
        SELECT TOP 1
          id,
          slug,
          title,
          price,
          status,
          prefecture,
          city,
          address,
          description,
          property_type,
          transaction_type,
          land_area_sqm,
          building_area_sqm,
          layout,
          access_info,
          built_year,
          built_month,
          latitude,
          longitude,
          updated_at
        FROM properties
        WHERE slug = @slug;
      `);

    if (existingResult.recordset.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Property not found.",
        },
      };
    }

    const propertyId = existingResult.recordset[0].id as string;
    const normalizedFeatureIds: string[] | undefined =
      input.featureIds === undefined
        ? undefined
        : [...new Set(input.featureIds)];

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input("id", sql.NVarChar, propertyId)
        .input("title", sql.NVarChar, input.title)
        .input("propertyType", sql.NVarChar, input.propertyType)
        .input("transactionType", sql.NVarChar, input.transactionType)
        .input("prefecture", sql.NVarChar, input.prefecture)
        .input("city", sql.NVarChar, input.city)
        .input("address", sql.NVarChar, input.address)
        .input("price", sql.Int, input.price)
        .input("landAreaSqm", sql.Decimal(18, 2), input.landAreaSqm)
        .input("buildingAreaSqm", sql.Decimal(18, 2), input.buildingAreaSqm)
        .input("layout", sql.NVarChar, input.layout)
        .input("description", sql.NVarChar, input.description)
        .input("accessInfo", sql.NVarChar, input.accessInfo)
        .input("builtYear", sql.Int, input.builtYear)
        .input("builtMonth", sql.Int, input.builtMonth)
        .input("latitude", sql.Decimal(10, 7), input.latitude ?? null)
        .input("longitude", sql.Decimal(10, 7), input.longitude ?? null)
        .input("status", sql.NVarChar, input.status)
        .query(`
          UPDATE properties
          SET
            title = @title,
            property_type = @propertyType,
            transaction_type = @transactionType,
            prefecture = @prefecture,
            city = @city,
            address = @address,
            price = @price,
            land_area_sqm = @landAreaSqm,
            building_area_sqm = @buildingAreaSqm,
            layout = @layout,
            description = @description,
            access_info = @accessInfo,
            built_year = @builtYear,
            built_month = @builtMonth,
            latitude = @latitude,
            longitude = @longitude,
            status = @status,
            updated_at = SYSUTCDATETIME()
          WHERE id = @id;
        `);

      if (normalizedFeatureIds !== undefined) {
        await assertFeatureIdsExist(transaction, normalizedFeatureIds);
        await replacePropertyFeatures(transaction, propertyId, normalizedFeatureIds);
      }

      const updatedResult = await transaction.request()
        .input("slug", sql.NVarChar, slug)
        .query(`
          SELECT TOP 1
            id,
            slug,
            title,
            price,
            status,
            prefecture,
            city,
            address,
            description,
            property_type,
            transaction_type,
            land_area_sqm,
            building_area_sqm,
            layout,
            access_info,
            built_year,
            built_month,
            latitude,
            longitude,
            updated_at
          FROM properties
          WHERE slug = @slug;
        `);

      const updatedProperty = mapManagementProperty(updatedResult.recordset[0]);
      const featureIds = await getFeatureIdsByPropertyId(transaction, propertyId);

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          ...updatedProperty,
          featureIds,
          message: "Property updated successfully.",
        },
      };
    } catch (error) {
      await transaction.rollback();

      if (error instanceof Error && error.message === "INVALID_FEATURE_IDS") {
        return {
          status: 400,
          jsonBody: {
            message: "One or more featureIds are invalid.",
          },
        };
      }

      throw error;
    }
  } catch (error) {
    context.error("patchManagementPropertyBySlug failed", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to update property.",
      },
    };
  }
}

app.http("management-properties-patch-by-slug", {
  methods: ["PATCH"],
  authLevel: "function",
  route: "management/properties/{slug}",
  handler: patchManagementPropertyBySlug,
});