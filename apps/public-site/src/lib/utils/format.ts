import type { PropertyPriceType } from "../../types/property";

export const formatPriceToManYen = (price?: number | null): string => {
  if (price === undefined || price === null) return "-";

  const manYen = price / 10000;
  return `${manYen.toLocaleString("ja-JP")}万円`;
};

export const formatPropertyPrice = (
  price?: number | null,
  priceType?: PropertyPriceType | string,
): string => {
  if (priceType === "consultation") {
    return "ご相談";
  }

  return formatPriceToManYen(price);
};

export const formatArea = (value?: number | null): string => {
  if (value === undefined || value === null) return "-";
  return `${value.toLocaleString("ja-JP")}㎡`;
};

export const formatPercent = (value?: number | null): string => {
  if (value === undefined || value === null) return "-";
  return `${value.toLocaleString("ja-JP")}%`;
};

export const formatText = (value?: string | number | null): string => {
  if (value === undefined || value === null) return "-";

  const text = String(value).trim();
  return text.length > 0 ? text : "-";
};

export const formatPropertyTypeLabel = (type: "land" | "house"): string => {
  return type === "land" ? "土地" : "戸建て";
};

export const formatTransactionTypeLabel = (value?: string | null): string => {
  switch (value) {
    case "seller":
      return "売主";
    case "brokerage":
      return "仲介";
    case "sale":
      return "売買";
    case "rent":
      return "賃貸";
    case "agency":
      return "代理";
    case "mediation":
      return "媒介";
    default:
      return formatText(value);
  }
};

export const formatAddress = (params: {
  prefecture?: string;
  city?: string;
  address1?: string;
}): string => {
  const address = [params.prefecture, params.city, params.address1]
    .filter(Boolean)
    .join("");

  return address || "-";
};

export const formatJapaneseDate = (dateString?: string): string => {
  if (!dateString) return "-";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};