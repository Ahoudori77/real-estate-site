import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { getSqlPool, sql } from "../../lib/sql";

type PropertyRow = {
  id: number;
  slug: string;
  property_number: string | null;
  title: string;
  property_type: string;
  transaction_type: string;
  prefecture: string;
  city: string;
  price_type: string;
  price: number | null;
  land_area_sqm: number | null;
  building_area_sqm: number | null;
  layout: string | null;
  status: string;
  published_at: Date | null;
  thumbnail_url: string | null;

  land_category: string | null;
  city_planning_area: string | null;
  zoning_district: string | null;
  building_coverage_ratio: number | null;
  floor_area_ratio: number | null;
  road_access: string | null;

  building_structure: string | null;
  building_floors: string | null;
  parking: string | null;

  current_status: string | null;
  handover_timing: string | null;
  facilities: string | null;
  remarks: string | null;
};

type CountRow = {
  total: number;
};

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

const nullableStringSchema = z.string().nullable().optional();
const nullableNumberSchema = z.number().nullable().optional();

const createManagementPropertySchema = z
  .object({
    // 既存UI互換のため slug は残す。
    // Review-004 以降で画面上は propertyNumber を主表示に寄せる。
    slug: slugSchema.optional(),
    propertyNumber: z.string().min(1).optional(),

    title: z.string().min(1),
    propertyType: z.enum(["land", "house"]),
    transactionType: z.enum(["seller", "brokerage"]),

    prefecture: z.string().min(1),
    city: z.string().min(1),
    address: z.string().min(1),

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
    if (!data.slug && !data.propertyNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["propertyNumber"],
        message: "propertyNumber or slug is required.",
      });
    }

    if (data.priceType === "fixed" && (data.price === null || data.price === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "price is required when priceType is fixed.",
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

function applyAdminFilters(
  request: sql.Request,
  filters: {
    propertyType?: string;
    prefecture?: string;
    city?: string;
    featureSlugs: string[];
  },
) {
  const whereClauses: string[] = [];

  if (filters.propertyType) {
    whereClauses.push("p.property_type = @propertyType");
    request.input("propertyType", sql.NVarChar(20), filters.propertyType);
  }

  if (filters.prefecture) {
    whereClauses.push("p.prefecture = @prefecture");
    request.input("prefecture", sql.NVarChar(100), filters.prefecture);
  }

  if (filters.city) {
    whereClauses.push("p.city = @city");
    request.input("city", sql.NVarChar(100), filters.city);
  }

  filters.featureSlugs.forEach((slug, index) => {
    const paramName = `featureSlug${index}`;

    whereClauses.push(`
      EXISTS (
        SELECT 1
        FROM dbo.property_features pf
        INNER JOIN dbo.features f
          ON pf.feature_id = f.id
        WHERE pf.property_id = p.id
          AND f.slug = @${paramName}
      )
    `);

    request.input(paramName, sql.NVarChar(100), slug);
  });

  return whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function mapPropertyListRow(row: PropertyRow) {
  return {
    id: row.id,
    slug: row.slug,
    propertyNumber: row.property_number,
    title: row.title,
    propertyType: row.property_type,
    transactionType: row.transaction_type,
    prefecture: row.prefecture,
    city: row.city,
    priceType: row.price_type,
    price: row.price === null ? null : Number(row.price),
    landAreaSqm: row.land_area_sqm === null ? null : Number(row.land_area_sqm),
    buildingAreaSqm: row.building_area_sqm === null ? null : Number(row.building_area_sqm),
    layout: row.layout,
    status: row.status,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,

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
  };
}

export async function adminProperties(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const pool = await getSqlPool();
    const url = new URL(request.url);

    const propertyType =
      url.searchParams.get("propertyType") ??
      url.searchParams.get("type") ??
      undefined;

    const prefecture = url.searchParams.get("prefecture") ?? undefined;
    const city = url.searchParams.get("city") ?? undefined;
    const featureSlugs = url.searchParams.getAll("features").filter(Boolean);

    const page = Math.max(1, Number(request.query.get("page") ?? "1") || 1);
    const pageSizeRaw = Number(request.query.get("pageSize") ?? "20") || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
    const offset = (page - 1) * pageSize;

    const countRequest = pool.request();
    const countWhereSql = applyAdminFilters(countRequest, {
      propertyType,
      prefecture,
      city,
      featureSlugs,
    });

    const countResult = await countRequest.query<CountRow>(`
      SELECT COUNT(*) AS total
      FROM dbo.properties p
      ${countWhereSql};
    `);

    const total = countResult.recordset[0]?.total ?? 0;

    const listRequest = pool.request();
    const listWhereSql = applyAdminFilters(listRequest, {
      propertyType,
      prefecture,
      city,
      featureSlugs,
    });

    listRequest.input("offset", sql.Int, offset);
    listRequest.input("pageSize", sql.Int, pageSize);

    const listResult = await listRequest.query<PropertyRow>(`
      SELECT
        p.id,
        p.slug,
        p.property_number,
        p.title,
        p.property_type,
        p.transaction_type,
        p.prefecture,
        p.city,
        p.price_type,
        p.price,
        p.land_area_sqm,
        p.building_area_sqm,
        p.layout,
        p.status,
        p.published_at,

        p.land_category,
        p.city_planning_area,
        p.zoning_district,
        p.building_coverage_ratio,
        p.floor_area_ratio,
        p.road_access,

        p.building_structure,
        p.building_floors,
        p.parking,

        p.current_status,
        p.handover_timing,
        p.facilities,
        p.remarks,

        thumb.image_url AS thumbnail_url
      FROM dbo.properties p
      OUTER APPLY (
        SELECT TOP 1 pi.image_url
        FROM dbo.property_images pi
        WHERE pi.property_id = p.id
        ORDER BY pi.sort_order, pi.id
      ) thumb
      ${listWhereSql}
      ORDER BY
        CASE WHEN p.published_at IS NULL THEN 1 ELSE 0 END,
        p.published_at DESC,
        p.id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);

    return {
      status: 200,
      jsonBody: {
        items: listResult.recordset.map(mapPropertyListRow),
        total,
        page,
        pageSize,
      },
    };
  } catch (error: unknown) {
    context.error("Failed to fetch admin properties.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch admin properties.",
      },
    };
  }
}

export async function createManagementProperty(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = await request.json();
    const parsed = createManagementPropertySchema.safeParse(body);

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

    const propertyNumber = input.propertyNumber ?? input.slug ?? "";
    const slug = input.slug ?? propertyNumber;
    const priceType = input.priceType;
    const price = priceType === "consultation" ? null : input.price ?? null;
    const publishedAt = input.status === "published" ? new Date() : null;

    const insertResult = await pool.request()
      .input("slug", sql.NVarChar(200), slug)
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
      .input("publishedAt", sql.DateTime2, publishedAt)

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
        INSERT INTO dbo.properties (
          slug,
          property_number,
          title,
          property_type,
          transaction_type,
          prefecture,
          city,
          address,
          price_type,
          price,
          land_area_sqm,
          building_area_sqm,
          layout,
          description,
          access_info,
          built_year,
          built_month,
          latitude,
          longitude,
          status,

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

          created_at,
          updated_at,
          published_at
        )
        OUTPUT inserted.id, inserted.slug, inserted.property_number
        VALUES (
          @slug,
          @propertyNumber,
          @title,
          @propertyType,
          @transactionType,
          @prefecture,
          @city,
          @address,
          @priceType,
          @price,
          @landAreaSqm,
          @buildingAreaSqm,
          @layout,
          @description,
          @accessInfo,
          @builtYear,
          @builtMonth,
          @latitude,
          @longitude,
          @status,

          @landCategory,
          @cityPlanningArea,
          @zoningDistrict,
          @buildingCoverageRatio,
          @floorAreaRatio,
          @roadAccess,

          @buildingStructure,
          @buildingFloors,
          @parking,

          @currentStatus,
          @handoverTiming,
          @facilities,
          @remarks,

          SYSUTCDATETIME(),
          SYSUTCDATETIME(),
          @publishedAt
        );
      `);

    return {
      status: 201,
      jsonBody: {
        id: String(insertResult.recordset[0].id),
        slug: insertResult.recordset[0].slug,
        propertyNumber: insertResult.recordset[0].property_number,
        message: "Property created successfully.",
      },
    };
  } catch (error: unknown) {
    context.error("Failed to create admin property.", error);

    if (isDuplicateKeyError(error)) {
      return {
        status: 409,
        jsonBody: {
          message: "The property number or slug is already in use.",
        },
      };
    }

    return {
      status: 500,
      jsonBody: {
        message: "Failed to create property.",
      },
    };
  }
}

app.http("adminProperties", {
  methods: ["GET"],
  authLevel: "function",
  route: "management/properties",
  handler: adminProperties,
});

app.http("management-properties-post", {
  methods: ["POST"],
  authLevel: "function",
  route: "management/properties",
  handler: createManagementProperty,
});