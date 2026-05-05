export function formatPrice(price: number): string {
  return `${price.toLocaleString("ja-JP")}円`;
}