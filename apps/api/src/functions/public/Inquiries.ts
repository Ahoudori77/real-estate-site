import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getSqlPool, sql } from "../../lib/sql";

type InquiryType = "general" | "property" | "visit" | "document" | "other";

type InquiryPayload = {
  inquiryType: InquiryType;
  propertySlug: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
};

const ALLOWED_INQUIRY_TYPES = new Set<InquiryType>([
  "general",
  "property",
  "visit",
  "document",
  "other",
]);

const MAX_NAME_LENGTH = 50;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePayload(input: unknown): {
  value?: InquiryPayload;
  error?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "リクエストボディは JSON object で送ってください。" };
  }

  const body = input as Record<string, unknown>;

  const inquiryTypeRaw = normalizeString(body.inquiryType) ?? "general";
  if (!ALLOWED_INQUIRY_TYPES.has(inquiryTypeRaw as InquiryType)) {
    return { error: "inquiryType が不正です。" };
  }

  const inquiryType = inquiryTypeRaw as InquiryType;
  const propertySlug = normalizeString(body.propertySlug);
  const name = normalizeString(body.name);
  const email = normalizeString(body.email);
  const phone = normalizeString(body.phone);
  const message = normalizeString(body.message);

  if (!name || name.length > MAX_NAME_LENGTH) {
    return { error: `name は 1〜${MAX_NAME_LENGTH} 文字で入力してください。` };
  }

  if (!email || email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
    return { error: "email の形式が不正です。" };
  }

  if (phone && phone.length > MAX_PHONE_LENGTH) {
    return { error: `phone は ${MAX_PHONE_LENGTH} 文字以内で入力してください。` };
  }

  if (
    !message ||
    message.length < MIN_MESSAGE_LENGTH ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return {
      error: `message は ${MIN_MESSAGE_LENGTH}〜${MAX_MESSAGE_LENGTH} 文字で入力してください。`,
    };
  }

  if (
    (inquiryType === "property" ||
      inquiryType === "visit" ||
      inquiryType === "document") &&
    !propertySlug
  ) {
    return { error: "propertySlug はこの inquiryType では必須です。" };
  }

  return {
    value: {
      inquiryType,
      propertySlug,
      name,
      email: email.toLowerCase(),
      phone,
      message,
    },
  };
}

export async function publicInquiriesPost(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: {
        code: "INVALID_JSON",
        message: "JSON が不正です。",
      },
    });
  }

  const parsed = validatePayload(body);
  if (!parsed.value) {
    return jsonResponse(400, {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error ?? "入力内容が不正です。",
      },
    });
  }

  try {
    const pool = await getSqlPool();

    let propertyId: number | null = null;

    if (parsed.value.propertySlug) {
      const propertyResult = await pool
        .request()
        .input("slug", sql.NVarChar(255), parsed.value.propertySlug)
        .query(`
          SELECT TOP 1 id
          FROM dbo.properties
          WHERE slug = @slug
        `);

      propertyId = propertyResult.recordset?.[0]?.id ?? null;

      if (!propertyId) {
        return jsonResponse(400, {
          ok: false,
          error: {
            code: "PROPERTY_NOT_FOUND",
            message: "指定された物件が見つかりません。",
          },
        });
      }
    }

    const result = await pool
      .request()
      .input("propertyId", sql.BigInt, propertyId)
      .input("name", sql.NVarChar(MAX_NAME_LENGTH), parsed.value.name)
      .input("email", sql.NVarChar(MAX_EMAIL_LENGTH), parsed.value.email)
      .input("phone", sql.NVarChar(MAX_PHONE_LENGTH), parsed.value.phone)
      .input("message", sql.NVarChar(MAX_MESSAGE_LENGTH), parsed.value.message)
      .query(`
        DECLARE @inserted TABLE (id BIGINT);

        INSERT INTO dbo.inquiries (
          property_id,
          name,
          email,
          phone,
          message,
          status
        )
        OUTPUT inserted.id INTO @inserted
        VALUES (
          @propertyId,
          @name,
          @email,
          @phone,
          @message,
          'new'
        );

        SELECT TOP 1 id
        FROM @inserted;
      `);

    const inquiryId = result.recordset?.[0]?.id ?? null;

    return jsonResponse(201, {
      ok: true,
      inquiryId,
      status: "received",
    });
  } catch (error) {
    context.log("publicInquiriesPost failed", error);

    return jsonResponse(500, {
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "問い合わせの送信に失敗しました。",
      },
    });
  }
}

app.http("publicInquiriesPost", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "public/inquiries",
  handler: publicInquiriesPost,
});