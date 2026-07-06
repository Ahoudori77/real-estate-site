import type { InvocationContext } from "@azure/functions";
import { EmailClient } from "@azure/communication-email";

type InquiryNotificationPayload = {
  inquiryId: string | null;
  inquiryType: string;
  propertySlug: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
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
  const receivedAt = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  return [
    "不動産サイトから新しい問い合わせが届きました。",
    "管理画面で確認してください。",
    "",
    `問い合わせID: ${payload.inquiryId ?? "-"}`,
    `問い合わせ種別: ${formatInquiryType(payload.inquiryType)}`,
    `受付日時: ${receivedAt}`,
    `対象物件slug: ${payload.propertySlug ?? "-"}`,
    "",
    `お名前: ${payload.name}`,
    "",
    "※問い合わせ本文・連絡先はこのメールには記載していません。",
    "※詳細は管理画面で確認してください。",
    "",
    adminUrl ? `管理画面: ${adminUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function sendWithAcsEmail(
  payload: InquiryNotificationPayload,
  context: InvocationContext,
): Promise<void> {
  const connectionString = process.env.ACS_EMAIL_CONNECTION_STRING;
  const toEmail = process.env.INQUIRY_NOTIFICATION_TO_EMAIL;
  const fromEmail = process.env.ACS_EMAIL_FROM_ADDRESS;

  if (!connectionString || !toEmail || !fromEmail) {
    context.log("Inquiry notification skipped. Notification env vars are not set.", {
      inquiryId: payload.inquiryId,
      hasAcsEmailConnectionString: Boolean(connectionString),
      hasToEmail: Boolean(toEmail),
      hasFromEmail: Boolean(fromEmail),
    });
    return;
  }

  const client = new EmailClient(connectionString);

  const subject = `【不動産サイト】新しい問い合わせが届きました（${formatInquiryType(
    payload.inquiryType,
  )}）`;

  await client.beginSend({
    senderAddress: fromEmail,
    content: {
      subject,
      plainText: buildNotificationText(payload),
    },
    recipients: {
      to: [{ address: toEmail }],
    },
  });

  context.log("Inquiry notification send request accepted.", {
    inquiryId: payload.inquiryId,
    toEmail,
    fromEmail,
  });
}

export async function notifyAdminInquiry(
  payload: InquiryNotificationPayload,
  context: InvocationContext,
): Promise<void> {
  try {
    await sendWithAcsEmail(payload, context);
  } catch (error) {
    context.error("Inquiry notification failed unexpectedly.", error);
  }
}
