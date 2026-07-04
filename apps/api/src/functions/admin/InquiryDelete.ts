import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getSqlPool, sql } from "../../lib/sql";

export async function deleteManagementInquiryById(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = Number(request.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return {
      status: 400,
      jsonBody: {
        message: "問い合わせIDが不正です。",
      },
    };
  }

  try {
    const pool = await getSqlPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.inquiries
        OUTPUT deleted.id
        WHERE id = @id;
      `);

    if (result.recordset.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "問い合わせが見つかりません。",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "問い合わせを削除しました。",
        id: String(id),
      },
    };
  } catch (error: unknown) {
    context.error("deleteManagementInquiryById failed", error);

    return {
      status: 500,
      jsonBody: {
        message: "問い合わせの削除に失敗しました。",
      },
    };
  }
}

app.http("management-inquiries-delete-by-id", {
  methods: ["DELETE"],
  authLevel: "function",
  route: "management/inquiries/{id}",
  handler: deleteManagementInquiryById,
});
