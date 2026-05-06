type InquiryPayload = {
  inquiryType: string;
  propertySlug: string | null;
  name: string;
  email: string;
  phone: string;
  message: string;
};

type InquiryResponse = {
  ok: boolean;
  inquiryId?: string | number | null;
  status?: string;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

function resolveErrorMessage(data: InquiryResponse | null): string {
  if (!data || typeof data !== "object") {
    return "問い合わせの送信に失敗しました。";
  }

  if (data.error?.message) {
    return data.error.message;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  return "問い合わせの送信に失敗しました。";
}

export async function postInquiry(
  payload: InquiryPayload,
  apiBaseUrl = "",
): Promise<InquiryResponse> {
  const endpoint = "/api/public/inquiries";
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");
  const url = normalizedApiBaseUrl
    ? `${normalizedApiBaseUrl}${endpoint}`
    : endpoint;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data: InquiryResponse | null = null;

  try {
    data = (await response.json()) as InquiryResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return data ?? { ok: true };
}
