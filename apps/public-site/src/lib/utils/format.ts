export const formatPriceToManYen = (price: number): string => {
  const manYen = price / 10000;
  return `${manYen.toLocaleString("ja-JP")}万円`;
};

export const formatArea = (value?: number): string => {
  if (value === undefined || value === null) return "-";
  return `${value.toLocaleString("ja-JP")}㎡`;
};

export const formatPropertyTypeLabel = (type: "land" | "house"): string => {
  return type === "land" ? "土地" : "戸建て";
};

export const formatAddress = (params: {
  prefecture?: string;
  city?: string;
  address1?: string;
}): string => {
  return [params.prefecture, params.city, params.address1]
    .filter(Boolean)
    .join("");
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