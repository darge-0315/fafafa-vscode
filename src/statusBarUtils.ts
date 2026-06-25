import * as vscode from 'vscode';
import { StockData } from './stockApi';
import { buildStockTooltipMarkdown } from './statusBarText';

export { STATUS_BAR_ITEM_ID, STATUS_BAR_PRIORITY, buildStockStatusText } from './statusBarText';

/** 构建状态栏悬停 tooltip */
export function buildStockStatusTooltip(
  codes: string[],
  getData: (code: string) => StockData | undefined
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportThemeIcons = true;
  md.appendMarkdown(buildStockTooltipMarkdown(codes, getData));
  return md;
}
