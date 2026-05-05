import { sql } from "./sql";

type DbLike = sql.ConnectionPool | sql.Transaction;

export type ManagementFeature = {
  id: string;
  slug: string;
  name: string;
  category: string;
  sortOrder: number;
  usageCount: number;
};

function bindStringArray(
  request: sql.Request,
  values: string[],
  prefix: string,
): string {
  return values
    .map((value, index) => {
      const key = `${prefix}${index}`;
      request.input(key, sql.NVarChar, value);
      return `@${key}`;
    })
    .join(", ");
}

export async function listManagementFeatures(
  db: DbLike,
): Promise<ManagementFeature[]> {
  const result = await db.request().query(`
    SELECT
      f.id,
      f.slug,
      f.name,
      f.category,
      f.sort_order,
      COUNT(pf.feature_id) AS usage_count
    FROM features f
    LEFT JOIN property_features pf
      ON pf.feature_id = f.id
    GROUP BY
      f.id,
      f.slug,
      f.name,
      f.category,
      f.sort_order
    ORDER BY f.sort_order ASC, f.name ASC;
  `);

  return result.recordset.map((row: any) => ({
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    category: row.category,
    sortOrder: Number(row.sort_order ?? 0),
    usageCount: Number(row.usage_count ?? 0),
  }));
}

export async function getFeatureIdsByPropertyId(
  db: DbLike,
  propertyId: string,
): Promise<string[]> {
  const result = await db.request()
    .input("propertyId", sql.NVarChar, propertyId)
    .query(`
      SELECT feature_id
      FROM property_features
      WHERE property_id = @propertyId
      ORDER BY feature_id ASC;
    `);

  return result.recordset.map((row: any) => String(row.feature_id));
}

export async function assertFeatureIdsExist(
  db: DbLike,
  featureIds: string[],
): Promise<void> {
  const normalized = [...new Set(featureIds)];

  if (normalized.length === 0) {
    return;
  }

  const request = db.request();
  const inClause = bindStringArray(request, normalized, "featureId");

  const result = await request.query(`
    SELECT id
    FROM features
    WHERE id IN (${inClause});
  `);

  const foundIds = new Set(result.recordset.map((row: any) => String(row.id)));
  const hasInvalidId = normalized.some((id) => !foundIds.has(id));

  if (hasInvalidId) {
    throw new Error("INVALID_FEATURE_IDS");
  }
}

export async function replacePropertyFeatures(
  transaction: sql.Transaction,
  propertyId: string,
  featureIds: string[],
): Promise<void> {
  const normalized = [...new Set(featureIds)];

  await transaction.request()
    .input("propertyId", sql.NVarChar, propertyId)
    .query(`
      DELETE FROM property_features
      WHERE property_id = @propertyId;
    `);

  if (normalized.length === 0) {
    return;
  }

  const request = transaction.request()
    .input("propertyId", sql.NVarChar, propertyId);

  const valuesSql = normalized
    .map((featureId, index) => {
      const key = `featureId${index}`;
      request.input(key, sql.NVarChar, featureId);
      return `(@propertyId, @${key})`;
    })
    .join(", ");

  await request.query(`
    INSERT INTO property_features (property_id, feature_id)
    VALUES ${valuesSql};
  `);
}