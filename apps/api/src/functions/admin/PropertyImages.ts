import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { getSqlPool, sql } from "../../lib/sql";

type PropertyImageRow = {
  id: number;
  property_id: number;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type PropertyRow = {
  id: number;
  slug: string;
};

const createPropertyImageSchema = z.object({
  imageUrl: z.string().min(1),
  altText: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const updatePropertyImageSchema = z
  .object({
    imageUrl: z.string().min(1).optional(),
    altText: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine(
    (data) =>
      data.imageUrl !== undefined ||
      data.altText !== undefined ||
      data.sortOrder !== undefined,
    {
      message: "At least one field is required.",
    }
  );

function mapPropertyImage(row: PropertyImageRow) {
  return {
    id: Number(row.id),
    propertyId: Number(row.property_id),
    imageUrl: row.image_url,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findPropertyBySlug(slug: string): Promise<PropertyRow | null> {
  const pool = await getSqlPool();

  const result = await pool.request()
    .input("slug", sql.NVarChar(200), slug)
    .query<PropertyRow>(`
      SELECT TOP 1
        id,
        slug
      FROM dbo.properties
      WHERE slug = @slug;
    `);

  return result.recordset[0] ?? null;
}

export async function getManagementPropertyImages(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const slug = request.params.slug;

    if (!slug) {
      return {
        status: 400,
        jsonBody: {
          message: "slug is required.",
        },
      };
    }

    const property = await findPropertyBySlug(slug);

    if (!property) {
      return {
        status: 404,
        jsonBody: {
          message: "Property not found.",
        },
      };
    }

    const pool = await getSqlPool();

    const result = await pool.request()
      .input("propertyId", sql.BigInt, property.id)
      .query<PropertyImageRow>(`
        SELECT
          id,
          property_id,
          image_url,
          alt_text,
          sort_order,
          created_at,
          updated_at
        FROM dbo.property_images
        WHERE property_id = @propertyId
        ORDER BY sort_order ASC, id ASC;
      `);

    return {
      status: 200,
      jsonBody: {
        items: result.recordset.map(mapPropertyImage),
        total: result.recordset.length,
      },
    };
  } catch (error: unknown) {
    context.error("Failed to fetch property images.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch property images.",
      },
    };
  }
}

export async function createManagementPropertyImage(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const slug = request.params.slug;

    if (!slug) {
      return {
        status: 400,
        jsonBody: {
          message: "slug is required.",
        },
      };
    }

    const body = await request.json();
    const parsed = createPropertyImageSchema.safeParse(body);

    if (!parsed.success) {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid request body.",
          errors: parsed.error.flatten(),
        },
      };
    }

    const property = await findPropertyBySlug(slug);

    if (!property) {
      return {
        status: 404,
        jsonBody: {
          message: "Property not found.",
        },
      };
    }

    const input = parsed.data;
    const pool = await getSqlPool();

    let sortOrder = input.sortOrder;

    if (sortOrder === undefined) {
      const nextSortResult = await pool.request()
        .input("propertyId", sql.BigInt, property.id)
        .query<{ next_sort_order: number }>(`
          SELECT ISNULL(MAX(sort_order), 0) + 10 AS next_sort_order
          FROM dbo.property_images
          WHERE property_id = @propertyId;
        `);

      sortOrder = nextSortResult.recordset[0]?.next_sort_order ?? 10;
    }

    const result = await pool.request()
      .input("propertyId", sql.BigInt, property.id)
      .input("imageUrl", sql.NVarChar(1000), input.imageUrl)
      .input("altText", sql.NVarChar(255), input.altText ?? null)
      .input("sortOrder", sql.Int, sortOrder)
      .query<PropertyImageRow>(`
        INSERT INTO dbo.property_images (
          property_id,
          image_url,
          alt_text,
          sort_order,
          created_at,
          updated_at
        )
        OUTPUT
          inserted.id,
          inserted.property_id,
          inserted.image_url,
          inserted.alt_text,
          inserted.sort_order,
          inserted.created_at,
          inserted.updated_at
        VALUES (
          @propertyId,
          @imageUrl,
          @altText,
          @sortOrder,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        );
      `);

    return {
      status: 201,
      jsonBody: mapPropertyImage(result.recordset[0]),
    };
  } catch (error: unknown) {
    context.error("Failed to create property image.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to create property image.",
      },
    };
  }
}

export async function updateManagementPropertyImage(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const id = Number(request.params.id);

    if (!Number.isInteger(id)) {
      return {
        status: 400,
        jsonBody: {
          message: "valid id is required.",
        },
      };
    }

    const body = await request.json();
    const parsed = updatePropertyImageSchema.safeParse(body);

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
    const hasImageUrl = input.imageUrl !== undefined;
    const hasAltText = input.altText !== undefined;
    const hasSortOrder = input.sortOrder !== undefined;

    const pool = await getSqlPool();

    const result = await pool.request()
      .input("id", sql.BigInt, id)
      .input("imageUrl", sql.NVarChar(1000), input.imageUrl ?? null)
      .input("altText", sql.NVarChar(255), input.altText ?? null)
      .input("sortOrder", sql.Int, input.sortOrder ?? null)
      .input("hasImageUrl", sql.Bit, hasImageUrl)
      .input("hasAltText", sql.Bit, hasAltText)
      .input("hasSortOrder", sql.Bit, hasSortOrder)
      .query<PropertyImageRow>(`
        UPDATE dbo.property_images
        SET
          image_url = CASE
            WHEN @hasImageUrl = 1 THEN @imageUrl
            ELSE image_url
          END,
          alt_text = CASE
            WHEN @hasAltText = 1 THEN @altText
            ELSE alt_text
          END,
          sort_order = CASE
            WHEN @hasSortOrder = 1 THEN @sortOrder
            ELSE sort_order
          END,
          updated_at = SYSUTCDATETIME()
        OUTPUT
          inserted.id,
          inserted.property_id,
          inserted.image_url,
          inserted.alt_text,
          inserted.sort_order,
          inserted.created_at,
          inserted.updated_at
        WHERE id = @id;
      `);

    if (result.recordset.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Property image not found.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: mapPropertyImage(result.recordset[0]),
    };
  } catch (error: unknown) {
    context.error("Failed to update property image.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to update property image.",
      },
    };
  }
}

export async function deleteManagementPropertyImage(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const id = Number(request.params.id);

    if (!Number.isInteger(id)) {
      return {
        status: 400,
        jsonBody: {
          message: "valid id is required.",
        },
      };
    }

    const pool = await getSqlPool();

    const result = await pool.request()
      .input("id", sql.BigInt, id)
      .query<{ id: number }>(`
        DELETE FROM dbo.property_images
        OUTPUT deleted.id
        WHERE id = @id;
      `);

    if (result.recordset.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Property image not found.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        id,
        deleted: true,
      },
    };
  } catch (error: unknown) {
    context.error("Failed to delete property image.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to delete property image.",
      },
    };
  }
}

app.http("management-property-images-get", {
  methods: ["GET"],
  authLevel: "function",
  route: "management/properties/{slug}/images",
  handler: getManagementPropertyImages,
});

app.http("management-property-images-post", {
  methods: ["POST"],
  authLevel: "function",
  route: "management/properties/{slug}/images",
  handler: createManagementPropertyImage,
});

app.http("management-property-images-patch", {
  methods: ["PATCH"],
  authLevel: "function",
  route: "management/property-images/{id}",
  handler: updateManagementPropertyImage,
});

app.http("management-property-images-delete", {
  methods: ["DELETE"],
  authLevel: "function",
  route: "management/property-images/{id}",
  handler: deleteManagementPropertyImage,
});