/** 固定不可删除/拖动的默认股票（上证指数） */
export const PINNED_STOCKS: readonly string[] = ['000001'];

/** 判断股票是否为固定默认项 */
export function isPinnedStock(code: string): boolean {
  return PINNED_STOCKS.includes(code);
}

/** 将股票列表中的固定项按定义顺序置于最前 */
export function normalizeStockOrder(codes: string[]): string[] {
  const pinned = PINNED_STOCKS.filter((code) => codes.includes(code));
  const rest = codes.filter((code) => !isPinnedStock(code));
  return [...pinned, ...rest];
}
