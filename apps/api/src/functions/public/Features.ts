import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSqlPool } from "../../lib/sql";

type FeatureRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  sort_order: number;
};

export async function publicFeatures(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const pool = await getSqlPool();

    const result = await pool.request().query<FeatureRow>(`
      SELECT
        id,
        slug,
        name,
        category,
        sort_order
      FROM dbo.features
      ORDER BY sort_order, id;
    `);

    return {
      status: 200,
      jsonBody: {
        items: result.recordset.map((row: FeatureRow) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          category: row.category,
          sortOrder: row.sort_order,
        })),
      },
    };
  } catch (error: unknown) {
    context.error("Failed to fetch features.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch features.",
      },
    };
  }
}

app.http("publicFeatures", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "public/features",
  handler: publicFeatures,
});