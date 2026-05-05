import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getSqlPool, sql } from "../../lib/sql";

type InquiryRow = {
  id: number;
  property_slug: string | null;
  property_title: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
  created_at: Date | null;
};

type CountRow = {
  total: number;
};

function buildWhereClause(
  request: sql.Request,
  filters: {
    status?: string;
    propertySlug?: string;
    q?: string;
  }
) {
  const whereClauses: string[] = [];

  if (filters.status) {
    whereClauses.push("i.status = @status");
    request.input("status", sql.NVarChar(20), filters.status);
  }

  if (filters.propertySlug) {
    whereClauses.push("p.slug = @propertySlug");
    request.input("propertySlug", sql.NVarChar(255), filters.propertySlug);
  }

  if (filters.q) {
    whereClauses.push(`
      (
        i.name LIKE @q OR
        i.email LIKE @q OR
        i.phone LIKE @q OR
        i.message LIKE @q OR
        p.title LIKE @q OR
        p.slug LIKE @q
      )
    `);
    request.input("q", sql.NVarChar(255), `%${filters.q}%`);
  }

  return whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
}

export async function adminInquiries(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const pool = await getSqlPool();
    const url = new URL(request.url);

    const status = url.searchParams.get("status") ?? undefined;
    const propertySlug = url.searchParams.get("propertySlug") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    const page = Math.max(1, Number(request.query.get("page") ?? "1") || 1);
    const pageSizeRaw = Number(request.query.get("pageSize") ?? "20") || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
    const offset = (page - 1) * pageSize;

    const countRequest = pool.request();
    const countWhereSql = buildWhereClause(countRequest, {
      status,
      propertySlug,
      q,
    });

    const countResult = await countRequest.query<CountRow>(`
      SELECT COUNT(*) AS total
      FROM dbo.inquiries i
      LEFT JOIN dbo.properties p
        ON i.property_id = p.id
      ${countWhereSql};
    `);

    const total = countResult.recordset[0]?.total ?? 0;

    const listRequest = pool.request();
    const listWhereSql = buildWhereClause(listRequest, {
      status,
      propertySlug,
      q,
    });

    listRequest.input("offset", sql.Int, offset);
    listRequest.input("pageSize", sql.Int, pageSize);

    const listResult = await listRequest.query<InquiryRow>(`
      SELECT
        i.id,
        p.slug AS property_slug,
        p.title AS property_title,
        i.name,
        i.email,
        i.phone,
        i.message,
        i.status,
        i.created_at
      FROM dbo.inquiries i
      LEFT JOIN dbo.properties p
        ON i.property_id = p.id
      ${listWhereSql}
      ORDER BY i.created_at DESC, i.id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);

    return {
      status: 200,
      jsonBody: {
        items: listResult.recordset.map((row) => ({
          id: String(row.id),
          propertySlug: row.property_slug,
          propertyTitle: row.property_title,
          name: row.name,
          email: row.email,
          phone: row.phone,
          message: row.message,
          status: row.status,
          createdAt: row.created_at,
        })),
        total,
        page,
        pageSize,
      },
    };
  } catch (error: unknown) {
    context.error("Failed to fetch admin inquiries.", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch admin inquiries.",
      },
    };
  }
}

app.http("adminInquiries", {
  methods: ["GET"],
  authLevel: "function",
  route: "management/inquiries",
  handler: adminInquiries,
});