import type { InvocationContext } from "@azure/functions";

type InquiryNotificationPayload = {
  inquiryId: string | null;
  inquiryType: string;
  propertySlug: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
};

type SendGridMailRequest = {
  personalizations: Array<{
    to: Array<{ email: string }>;
  }>;
  from: {
    email: string;
    name?: string;
  };
  subject: string;
  content: Array<{
    type: "text/plain";
    value: string;
  }>;
};

function formatInquiryType(value: string): string {
  switch (value) {
    case "property":
      return "物件問い合わせ";
    case "visit":
      return "見学希望";
    case "document":
      return "資料請求";
    case "other":
      return "その他";
    case "general":
    default:
      return "一般問い合わせ";
  }
}

function buildNotificationText(payload: InquiryNotificationPayload): string {
  const adminUrl = process.env.ADMIN_INQUIRIES_URL;

  return [
    "不動産サイトから新しい問い合わせが届きました。",
    "",
    `問い合わせID: ${payload.inquiryId ?? "-"}`,
    `問い合わせ種別: ${formatInquiryType(payload.inquiryType)}`,
    `対象物件slug: ${payload.propertySlug ?? "-"}`,
    "",
    `お名前: ${payload.name}`,
    `メール: ${payload.email}`,
    `電話番号: ${payload.phone ?? "-"}`,
    "",
    "本文:",
    payload.message,
    "",
    adminUrl ? `管理画面: ${adminUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function sendWithSendGrid(
  payload: InquiryNotificationPayload,
  context: InvocationContext,
): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const toEmail = process.env.INQUIRY_NOTIFICATION_TO_EMAIL;
  const fromEmail = process.env.INQUIRY_NOTIFICATION_FROM_EMAIL;
  const fromName = process.env.INQUIRY_NOTIFICATION_FROM_NAME ?? "不動産サイト";

  if (!apiKey || !toEmail || !fromEmail) {
    context.log("Inquiry notification skipped. Notification env vars are not set.", {
      inquiryId: payload.inquiryId,
      hasSendGridApiKey: Boolean(apiKey),
      hasToEmail: Boolean(toEmail),
      hasFromEmail: Boolean(fromEmail),
    });
    return;
  }

  const subject = `【不動産サイト】新しい問い合わせが届きました（${formatInquiryType(
    payload.inquiryType,
  )}）`;

  const body: SendGridMailRequest = {
    personalizations: [
      {
        to: [{ email: toEmail }],
      },
    ],
    from: {
      email: fromEmail,
      name: fromName,
    },
    subject,
    content: [
      {
        type: "text/plain",
        value: buildNotificationText(payload),
      },
    ],
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    context.error("Inquiry notification failed.", {
      status: response.status,
      statusText: response.statusText,
      responseText: responseText.slice(0, 500),
      inquiryId: payload.inquiryId,
    });
    return;
  }

  context.log("Inquiry notification sent.", {
    inquiryId: payload.inquiryId,
    toEmail,
  });
}

export async function notifyAdminInquiry(
  payload: InquiryNotificationPayload,
  context: InvocationContext,
): Promise<void> {
  try {
    await sendWithSendGrid(payload, context);
  } catch (error) {
    context.error("Inquiry notification failed unexpectedly.", error);
  }
}
