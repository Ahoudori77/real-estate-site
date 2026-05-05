export type InquiryType = "general" | "property" | "visit" | "document" | "other";

export type PublicInquiryInput = {
  inquiryType: InquiryType;
  propertySlug?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
};

export type PublicInquiryResponse = {
  ok: true;
  inquiryId: string;
  status: "received";
};

type ErrorResponse = {
  ok: false;
  error?: {
    code?: string;
    message?: string;
  };
};

export async function postInquiry(
  input: PublicInquiryInput,
  apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL
): Promise<PublicInquiryResponse> {
  if (!apiBaseUrl) {
    throw new Error("PUBLIC_API_BASE_URL is not set.");
  }

  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const response = await fetch(`${normalizedApiBaseUrl}/api/public/inquiries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inquiryType: input.inquiryType,
      propertySlug: input.propertySlug ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      message: input.message,
    }),
  });

  let data: PublicInquiryResponse | ErrorResponse | null = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data && "error" in data && data.error?.message
        ? data.error.message
        : "問い合わせの送信に失敗しました。"
    );
  }

  return data as PublicInquiryResponse;
}