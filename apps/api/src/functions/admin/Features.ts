import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { sql, getSqlPool } from "../../lib/sql";
import { listManagementFeatures } from "../../lib/property-features";

const featureSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  name: z.string().min(1),
  category: z.string().min(1),
  sortOrder: z.number().int().min(0),
});

function mapFeature(row: any) {
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    category: row.category,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return !!(
    error &&
    typeof error === "object" &&
    "number" in error &&
    (error.number === 2601 || error.number === 2627)
  );
}

export async function getManagementFeatures(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const pool = await getSqlPool();
    const features = await listManagementFeatures(pool);

    return {
      status: 200,
      jsonBody: features,
    };
  } catch (error) {
    context.error("getManagementFeatures failed", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch management features.",
      },
    };
  }
}

export async function createManagementFeature(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = await request.json();
    const parsed = featureSchema.safeParse(body);

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

    const insertResult = await pool.request()
      .input("slug", sql.NVarChar, input.slug)
      .input("name", sql.NVarChar, input.name)
      .input("category", sql.NVarChar, input.category)
      .input("sortOrder", sql.Int, input.sortOrder)
      .query(`
        INSERT INTO features (slug, name, category, sort_order)
        OUTPUT inserted.id, inserted.slug, inserted.name, inserted.category, inserted.sort_order
        VALUES (@slug, @name, @category, @sortOrder);
      `);

    return {
      status: 201,
      jsonBody: {
        ...mapFeature(insertResult.recordset[0]),
        message: "Feature created successfully.",
      },
    };
  } catch (error) {
    context.error("createManagementFeature failed", error);

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
        message: "Failed to create feature.",
      },
    };
  }
}

export async function updateManagementFeature(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const rawId = request.params.id;
  const featureId = Number(rawId);

  if (!rawId || !Number.isInteger(featureId) || featureId <= 0) {
    return {
      status: 400,
      jsonBody: {
        message: "Valid feature id is required.",
      },
    };
  }

  try {
    const body = await request.json();
    const parsed = featureSchema.safeParse(body);

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

    const updateResult = await pool.request()
      .input("id", sql.Int, featureId)
      .input("slug", sql.NVarChar, input.slug)
      .input("name", sql.NVarChar, input.name)
      .input("category", sql.NVarChar, input.category)
      .input("sortOrder", sql.Int, input.sortOrder)
      .query(`
        UPDATE features
        SET
          slug = @slug,
          name = @name,
          category = @category,
          sort_order = @sortOrder
        OUTPUT inserted.id, inserted.slug, inserted.name, inserted.category, inserted.sort_order
        WHERE id = @id;
      `);

    if (updateResult.recordset.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Feature not found.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        ...mapFeature(updateResult.recordset[0]),
        message: "Feature updated successfully.",
      },
    };
  } catch (error) {
    context.error("updateManagementFeature failed", error);

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
        message: "Failed to update feature.",
      },
    };
  }
}

export async function deleteManagementFeature(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const rawId = request.params.id;
  const featureId = Number(rawId);

  if (!rawId || !Number.isInteger(featureId) || featureId <= 0) {
    return {
      status: 400,
      jsonBody: {
        message: "Valid feature id is required.",
      },
    };
  }

  try {
    const pool = await getSqlPool();

    const lookupResult = await pool.request()
      .input("id", sql.Int, featureId)
      .query(`
        SELECT TOP 1
          f.id,
          (
            SELECT COUNT(*)
            FROM property_features pf
            WHERE pf.feature_id = f.id
          ) AS usage_count
        FROM features f
        WHERE f.id = @id;
      `);

    if (lookupResult.recordset.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Feature not found.",
        },
      };
    }

    const usageCount = Number(lookupResult.recordset[0].usage_count ?? 0);

    if (usageCount > 0) {
      return {
        status: 409,
        jsonBody: {
          message: "Feature is in use and cannot be deleted.",
        },
      };
    }

    await pool.request()
      .input("id", sql.Int, featureId)
      .query(`
        DELETE FROM features
        WHERE id = @id;
      `);

    return {
      status: 200,
      jsonBody: {
        message: "Feature deleted successfully.",
      },
    };
  } catch (error) {
    context.error("deleteManagementFeature failed", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to delete feature.",
      },
    };
  }
}

app.http("management-features-get", {
  methods: ["GET"],
  authLevel: "function",
  route: "management/features",
  handler: getManagementFeatures,
});

app.http("management-features-post", {
  methods: ["POST"],
  authLevel: "function",
  route: "management/features",
  handler: createManagementFeature,
});

app.http("management-features-patch-by-id", {
  methods: ["PATCH"],
  authLevel: "function",
  route: "management/features/{id}",
  handler: updateManagementFeature,
});

app.http("management-features-delete-by-id", {
  methods: ["DELETE"],
  authLevel: "function",
  route: "management/features/{id}",
  handler: deleteManagementFeature,
});