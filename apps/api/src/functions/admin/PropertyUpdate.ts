import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { sql, getSqlPool } from "../../lib/sql";
import {
  assertFeatureIdsExist,
  getFeatureIdsByPropertyId,
  replacePropertyFeatures,
} from "../../lib/property-features";

const nullableStringSchema = z.string().nullable().optional();
const nullableNumberSchema = z.number().nullable().optional();

const patchManagementPropertySchema = z
  .object({
    propertyNumber: z.string().min(1).optional(),

    title: z.string().min(1),
    propertyType: z.enum(["land", "house"]),
    transactionType: z.enum(["seller", "brokerage"]),

    prefecture: z.string(),
    city: z.string(),
    address: z.string(),

    priceType: z.enum(["fixed", "consultation"]).default("fixed"),
    price: z.number().int().nonnegative().nullable().optional(),

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

    landCategory: nullableStringSchema,
    cityPlanningArea: nullableStringSchema,
    zoningDistrict: nullableStringSchema,
    buildingCoverageRatio: nullableNumberSchema,
    floorAreaRatio: nullableNumberSchema,
    roadAccess: nullableStringSchema,

    buildingStructure: nullableStringSchema,
    buildingFloors: nullableStringSchema,
    parking: nullableStringSchema,

    currentStatus: nullableStringSchema,
    handoverTiming: nullableStringSchema,
    facilities: nullableStringSchema,
    remarks: nullableStringSchema,
  })
  .superRefine((data, ctx) => {
    if (
      data.priceType === "fixed" &&
      (data.price === null || data.price === undefined || data.price <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "価格種別が固定の場合は、1円以上の価格を入力してください。",
      });
    }
  });

function isDuplicateKeyError(error: unknown): boolean {
  return !!(
    error &&
    typeof error === "object" &&
    "number" in error &&
    (error.number === 2601 || error.number === 2627)
  );
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function mapManagementProperty(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    propertyNumber: row.property_number,
    title: row.title,
    priceType: row.price_type,
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

    landCategory: row.land_category,
    cityPlanningArea: row.city_planning_area,
    zoningDistrict: row.zoning_district,
    buildingCoverageRatio:
      row.building_coverage_ratio === null ? null : Number(row.building_coverage_ratio),
    floorAreaRatio: row.floor_area_ratio === null ? null : Number(row.floor_area_ratio),
    roadAccess: row.road_access,

    buildingStructure: row.building_structure,
    buildingFloors: row.building_floors,
    parking: row.parking,

    currentStatus: row.current_status,
    handoverTiming: row.handover_timing,
    facilities: row.facilities,
    remarks: row.remarks,

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
          property_number,
          title,
          price_type,
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

          land_category,
          city_planning_area,
          zoning_district,
          building_coverage_ratio,
          floor_area_ratio,
          road_access,

          building_structure,
          building_floors,
          parking,

          current_status,
          handover_timing,
          facilities,
          remarks,

          updated_at
        FROM dbo.properties
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

    const existingProperty = existingResult.recordset[0];
    const propertyId = existingProperty.id as string;

    const propertyNumber = input.propertyNumber ?? existingProperty.property_number ?? slug;
    const priceType = input.priceType;
    const price = priceType === "consultation" ? null : input.price ?? null;

    const normalizedFeatureIds: string[] | undefined =
      input.featureIds === undefined
        ? undefined
        : [...new Set(input.featureIds)];

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input("id", sql.NVarChar, propertyId)
        .input("propertyNumber", sql.NVarChar(200), propertyNumber)
        .input("title", sql.NVarChar(200), input.title)
        .input("propertyType", sql.NVarChar(20), input.propertyType)
        .input("transactionType", sql.NVarChar(20), input.transactionType)
        .input("prefecture", sql.NVarChar(100), input.prefecture)
        .input("city", sql.NVarChar(100), input.city)
        .input("address", sql.NVarChar(255), input.address)
        .input("priceType", sql.NVarChar(20), priceType)
        .input("price", sql.Int, price)
        .input("landAreaSqm", sql.Decimal(18, 2), input.landAreaSqm)
        .input("buildingAreaSqm", sql.Decimal(18, 2), input.buildingAreaSqm)
        .input("layout", sql.NVarChar(100), input.layout)
        .input("description", sql.NVarChar(sql.MAX), input.description)
        .input("accessInfo", sql.NVarChar(255), input.accessInfo)
        .input("builtYear", sql.Int, input.builtYear)
        .input("builtMonth", sql.Int, input.builtMonth)
        .input("latitude", sql.Decimal(10, 7), input.latitude ?? null)
        .input("longitude", sql.Decimal(10, 7), input.longitude ?? null)
        .input("status", sql.NVarChar(20), input.status)

        .input("landCategory", sql.NVarChar(100), normalizeNullableString(input.landCategory))
        .input("cityPlanningArea", sql.NVarChar(100), normalizeNullableString(input.cityPlanningArea))
        .input("zoningDistrict", sql.NVarChar(100), normalizeNullableString(input.zoningDistrict))
        .input("buildingCoverageRatio", sql.Decimal(10, 2), input.buildingCoverageRatio ?? null)
        .input("floorAreaRatio", sql.Decimal(10, 2), input.floorAreaRatio ?? null)
        .input("roadAccess", sql.NVarChar(255), normalizeNullableString(input.roadAccess))

        .input("buildingStructure", sql.NVarChar(100), normalizeNullableString(input.buildingStructure))
        .input("buildingFloors", sql.NVarChar(100), normalizeNullableString(input.buildingFloors))
        .input("parking", sql.NVarChar(100), normalizeNullableString(input.parking))

        .input("currentStatus", sql.NVarChar(100), normalizeNullableString(input.currentStatus))
        .input("handoverTiming", sql.NVarChar(100), normalizeNullableString(input.handoverTiming))
        .input("facilities", sql.NVarChar(sql.MAX), normalizeNullableString(input.facilities))
        .input("remarks", sql.NVarChar(sql.MAX), normalizeNullableString(input.remarks))
        .query(`
          UPDATE dbo.properties
          SET
            property_number = @propertyNumber,
            title = @title,
            property_type = @propertyType,
            transaction_type = @transactionType,
            prefecture = @prefecture,
            city = @city,
            address = @address,
            price_type = @priceType,
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

            land_category = @landCategory,
            city_planning_area = @cityPlanningArea,
            zoning_district = @zoningDistrict,
            building_coverage_ratio = @buildingCoverageRatio,
            floor_area_ratio = @floorAreaRatio,
            road_access = @roadAccess,

            building_structure = @buildingStructure,
            building_floors = @buildingFloors,
            parking = @parking,

            current_status = @currentStatus,
            handover_timing = @handoverTiming,
            facilities = @facilities,
            remarks = @remarks,

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
            property_number,
            title,
            price_type,
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

            land_category,
            city_planning_area,
            zoning_district,
            building_coverage_ratio,
            floor_area_ratio,
            road_access,

            building_structure,
            building_floors,
            parking,

            current_status,
            handover_timing,
            facilities,
            remarks,

            updated_at
          FROM dbo.properties
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

    if (isDuplicateKeyError(error)) {
      return {
        status: 409,
        jsonBody: {
          message: "物件番号はすでに使用されています。",
        },
      };
    }

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
