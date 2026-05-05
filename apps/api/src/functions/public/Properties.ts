import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
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

type PropertyFeatureRow = {
  property_id: number;
  slug: string;
  name: string;
  category: string;
  sort_order: number;
};

type CountRow = {
  total: number;
};

type PublicFeature = {
  slug: string;
  name: string;
  category: string;
  sortOrder: number;
};

function applyFilters(
  request: sql.Request,
  filters: {
    propertyType?: string;
    prefecture?: string;
    city?: string;
    featureValues: string[];
  },
) {
  const whereClauses: string[] = ["p.status = @status"];
  request.input("status", sql.NVarChar(20), "published");

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

  filters.featureValues.forEach((featureValue, index) => {
    const paramName = `featureValue${index}`;

    whereClauses.push(`
      EXISTS (
        SELECT 1
        FROM dbo.property_features pf
        INNER JOIN dbo.features f
          ON pf.feature_id = f.id
        WHERE pf.property_id = p.id
          AND (
            f.slug = @${paramName}
            OR f.name = @${paramName}
          )
      )
    `);

    request.input(paramName, sql.NVarChar(100), featureValue);
  });

  return whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
}

async function fetchFeaturesByPropertyIds(
  pool: sql.ConnectionPool,
  propertyIds: number[],
): Promise<Map<string, PublicFeature[]>> {
  const featureMap = new Map<string, PublicFeature[]>();

  if (propertyIds.length === 0) {
    return featureMap;
  }

  const featuresRequest = pool.request();

  const inClause = propertyIds
    .map((propertyId, index) => {
      const paramName = `propertyId${index}`;
      featuresRequest.input(paramName, sql.BigInt, propertyId);
      return `@${paramName}`;
    })
    .join(", ");

  const featuresResult = await featuresRequest.query<PropertyFeatureRow>(`
    SELECT
      pf.property_id,
      f.slug,
      f.name,
      f.category,
      f.sort_order
    FROM dbo.property_features pf
    INNER JOIN dbo.features f
      ON pf.feature_id = f.id
    WHERE pf.property_id IN (${inClause})
    ORDER BY
      pf.property_id,
      f.sort_order,
      f.id;
  `);

  for (const row of featuresResult.recordset) {
    const propertyId = String(row.property_id);
    const current = featureMap.get(propertyId) ?? [];

    current.push({
      slug: row.slug,
      name: row.name,
      category: row.category,
      sortOrder: row.sort_order,
    });

    featureMap.set(propertyId, current);
  }

  return featureMap;
}

export async function publicProperties(
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

    // SearchForm は「駐車場あり」のような name を送る。
    // 将来 GET /api/public/features と連携した場合は slug 送信もあり得るので、
    // API側では slug / name の両方に対応する。
    const featureValues = url.searchParams
      .getAll("features")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);

    const page = Math.max(1, Number(request.query.get("page") ?? "1") || 1);
    const pageSizeRaw = Number(request.query.get("pageSize") ?? "12") || 12;

    // フロント側の一括取得・クライアント側絞り込みにも耐えられるように上限を少し広げる。
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 1000);
    const offset = (page - 1) * pageSize;

    const countRequest = pool.request();
    const countWhereSql = applyFilters(countRequest, {
      propertyType,
      prefecture,
      city,
      featureValues,
    });

    const countResult = await countRequest.query<CountRow>(`
      SELECT COUNT(*) AS total
      FROM dbo.properties p
      ${countWhereSql};
    `);

    const total = countResult.recordset[0]?.total ?? 0;

    const listRequest = pool.request();
    const listWhereSql = applyFilters(listRequest, {
      propertyType,
      prefecture,
      city,
      featureValues,
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
      ORDER BY p.published_at DESC, p.id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);

    const propertyIds = listResult.recordset.map((row) => row.id);
    const featuresByPropertyId = await fetchFeaturesByPropertyIds(pool, propertyIds);

    return {
      status: 200,
      jsonBody: {
        items: listResult.recordset.map((row) => {
          const features = featuresByPropertyId.get(String(row.id)) ?? [];

          return {
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
            featureSlugs: features.map((feature) => feature.slug),
            features,
          };
        }),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  } catch (error: unknown) {
    context.error("Failed to fetch properties.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch properties.",
      },
    };
  }
}

app.http("publicProperties", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "public/properties",
  handler: publicProperties,
});