import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getSqlPool, sql } from "../../lib/sql";

type PropertyRow = {
  id: number;
  slug: string;
  property_number: string | null;
  title: string;
};

type CountRow = {
  total: number;
};

export async function deleteManagementPropertyBySlug(
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
    const pool = await getSqlPool();

    const propertyResult = await pool.request()
      .input("slug", sql.NVarChar(200), slug)
      .query<PropertyRow>(`
        SELECT TOP 1
          id,
          slug,
          property_number,
          title
        FROM dbo.properties
        WHERE slug = @slug;
      `);

    const property = propertyResult.recordset[0];

    if (!property) {
      return {
        status: 404,
        jsonBody: {
          message: "物件が見つかりません。",
        },
      };
    }

    const inquiryCountResult = await pool.request()
      .input("propertyId", sql.BigInt, property.id)
      .query<CountRow>(`
        SELECT COUNT(*) AS total
        FROM dbo.inquiries
        WHERE property_id = @propertyId;
      `);

    const inquiryCount = inquiryCountResult.recordset[0]?.total ?? 0;

    if (inquiryCount > 0) {
      return {
        status: 409,
        jsonBody: {
          message:
            "この物件には問い合わせ履歴があるため削除できません。先に対象の問い合わせを削除するか、物件をアーカイブしてください。",
        },
      };
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input("propertyId", sql.BigInt, property.id)
        .query(`
          DELETE FROM dbo.property_features
          WHERE property_id = @propertyId;

          DELETE FROM dbo.property_images
          WHERE property_id = @propertyId;

          DELETE FROM dbo.properties
          WHERE id = @propertyId;
        `);

      await transaction.commit();

      return {
        status: 200,
        jsonBody: {
          message: "物件を削除しました。",
          slug: property.slug,
          propertyNumber: property.property_number,
          title: property.title,
          deleted: true,
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: unknown) {
    context.error("deleteManagementPropertyBySlug failed", error);

    return {
      status: 500,
      jsonBody: {
        message: "物件の削除に失敗しました。",
      },
    };
  }
}

app.http("management-properties-delete-by-slug", {
  methods: ["DELETE"],
  authLevel: "function",
  route: "management/properties/{slug}",
  handler: deleteManagementPropertyBySlug,
});
