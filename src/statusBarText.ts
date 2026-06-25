import { formatPercent, StockData } from './stockApi';

/** 状态栏项 ID */
export const STATUS_BAR_ITEM_ID = 'fafafa.status';

/** 状态栏项优先级（Right 对齐，数值越小越靠右） */
export const STATUS_BAR_PRIORITY = -100;

/** 拼接状态栏涨幅文本（仅百分比，空格分隔） */
export function buildStockStatusText(
  codes: string[],
  getData: (code: string) => Pick<StockData, 'percent'> | undefined
): string {
  return codes
    .map((code) => {
      const data = getData(code);
      return data ? formatPercent(data.percent) : '...';
    })
    .join(' ');
}

/** 生成 tooltip 的 Markdown 正文 */
export function buildStockTooltipMarkdown(
  codes: string[],
  getData: (code: string) => StockData | undefined
): string {
  const parts: string[] = [];
  for (const code of codes) {
    const data = getData(code);
    if (!data) {
      parts.push(`${code}: 加载中...`);
      continue;
    }
    const sign = data.change > 0 ? '+' : '';
    const pctSign = data.percent > 0 ? '+' : '';
    parts.push(`**${data.name} (${data.code})**`);
    parts.push(
      `现价: ${data.current.toFixed(2)} | 涨跌: ${sign}${data.change.toFixed(2)} (${pctSign}${data.percent.toFixed(2)}%) | 昨收: ${data.yesterday.toFixed(2)}`
    );
    parts.push('');
  }
  return parts.join('\n');
}
