function buildApiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.items)) {
      return record.items as T[];
    }

    if (Array.isArray(record.data)) {
      return record.data as T[];
    }

    if (Array.isArray(record.results)) {
      return record.results as T[];
    }
  }

  throw new Error("API レスポンスの配列形式を解釈できませんでした。");
}

export async function fetchList<T>(path: string): Promise<T[]> {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const detail = bodyText ? `: ${bodyText.slice(0, 180)}` : "";
    throw new Error(`API取得失敗 ${response.status} ${response.statusText}${detail}`);
  }

  const json: unknown = await response.json();
  return unwrapList<T>(json);
}

export async function fetchDetail<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const detail = bodyText ? `: ${bodyText.slice(0, 180)}` : "";
    throw new Error(`API取得失敗 ${response.status} ${response.statusText}${detail}`);
  }

  return (await response.json()) as T;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatPrice(value?: number | null): string {
  if (typeof value !== "number") return "-";

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

export function truncateText(value: unknown, maxLength = 80): string {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}