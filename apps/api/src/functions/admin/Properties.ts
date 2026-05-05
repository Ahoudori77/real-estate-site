import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { getSqlPool, sql } from "../../lib/sql";

type PropertyRow = {
  id: number;
  slug: string;
  title: string;
  property_type: string;
  transaction_type: string;
  prefecture: string;
  city: string;
  price: number;
  land_area_sqm: number | null;
  building_area_sqm: number | null;
  layout: string | null;
  status: string;
  published_at: Date | null;
  thumbnail_url: string | null;
};

type CountRow = {
  total: number;
};

const createManagementPropertySchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  title: z.string().min(1),
  propertyType: z.enum(["land", "house"]),
  transactionType: z.literal("sale"),
  prefecture: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  price: z.number().int().nonnegative(),
  landAreaSqm: z.number().nullable(),
  buildingAreaSqm: z.number().nullable(),
  layout: z.string().nullable(),
  description: z.string(),
  accessInfo: z.string().nullable(),
  builtYear: z.number().int().nullable(),
  builtMonth: z.number().int().nullable(),
  status: z.enum(["draft", "published", "archived"]),
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
  }
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

export async function adminProperties(
  request: HttpRequest,
  context: InvocationContext
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
        p.title,
        p.property_type,
        p.transaction_type,
        p.prefecture,
        p.city,
        p.price,
        p.land_area_sqm,
        p.building_area_sqm,
        p.layout,
        p.status,
        p.published_at,
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
        items: listResult.recordset.map((row: PropertyRow) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          propertyType: row.property_type,
          transactionType: row.transaction_type,
          prefecture: row.prefecture,
          city: row.city,
          price: row.price,
          landAreaSqm: row.land_area_sqm,
          buildingAreaSqm: row.building_area_sqm,
          layout: row.layout,
          status: row.status,
          thumbnailUrl: row.thumbnail_url,
          publishedAt: row.published_at,
        })),
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
  context: InvocationContext
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
    const publishedAt = input.status === "published" ? new Date() : null;

    const insertResult = await pool.request()
      .input("slug", sql.NVarChar(200), input.slug)
      .input("title", sql.NVarChar(200), input.title)
      .input("propertyType", sql.NVarChar(20), input.propertyType)
      .input("transactionType", sql.NVarChar(20), input.transactionType)
      .input("prefecture", sql.NVarChar(100), input.prefecture)
      .input("city", sql.NVarChar(100), input.city)
      .input("address", sql.NVarChar(255), input.address)
      .input("price", sql.Int, input.price)
      .input("landAreaSqm", sql.Decimal(18, 2), input.landAreaSqm)
      .input("buildingAreaSqm", sql.Decimal(18, 2), input.buildingAreaSqm)
      .input("layout", sql.NVarChar(100), input.layout)
      .input("description", sql.NVarChar(sql.MAX), input.description)
      .input("accessInfo", sql.NVarChar(255), input.accessInfo)
      .input("builtYear", sql.Int, input.builtYear)
      .input("builtMonth", sql.Int, input.builtMonth)
      .input("status", sql.NVarChar(20), input.status)
      .input("publishedAt", sql.DateTime2, publishedAt)
      .query(`
        INSERT INTO dbo.properties (
          slug,
          title,
          property_type,
          transaction_type,
          prefecture,
          city,
          address,
          price,
          land_area_sqm,
          building_area_sqm,
          layout,
          description,
          access_info,
          built_year,
          built_month,
          status,
          created_at,
          updated_at,
          published_at
        )
        OUTPUT inserted.id, inserted.slug
        VALUES (
          @slug,
          @title,
          @propertyType,
          @transactionType,
          @prefecture,
          @city,
          @address,
          @price,
          @landAreaSqm,
          @buildingAreaSqm,
          @layout,
          @description,
          @accessInfo,
          @builtYear,
          @builtMonth,
          @status,
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
        message: "Property created successfully.",
      },
    };
  } catch (error: unknown) {
    context.error("Failed to create admin property.", error);

    if (isDuplicateKeyError(error)) {
      return {
        status: 409,
        jsonBody: {
          message: "The slug is already in use.",
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