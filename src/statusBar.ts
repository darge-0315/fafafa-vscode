import * as vscode from 'vscode';
import { StockManager } from './stockManager';
import {
  STATUS_BAR_ITEM_ID,
  STATUS_BAR_PRIORITY,
  buildStockStatusText,
  buildStockStatusTooltip,
} from './statusBarUtils';

/** 管理状态栏股票项渲染 */
export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly manager: StockManager) {
    this.item = vscode.window.createStatusBarItem(
      STATUS_BAR_ITEM_ID,
      vscode.StatusBarAlignment.Right,
      STATUS_BAR_PRIORITY
    );
    this.item.name = '发发发';
    this.item.command = 'fafafa.showMenu';
    this.item.tooltip = '点击管理发发发股票栏';

    this.disposables.push(
      this.item,
      manager.onDidChange(() => this.render())
    );

    this.render();
  }

  /** 根据当前数据重新渲染状态栏项（始终保持显示，确保右键菜单可见） */
  render(): void {
    const visible = this.manager.getVisible();
    const stocks = this.manager.getStocks();

    this.item.color = undefined;

    if (!visible) {
      this.item.text = '$(eye-closed) 发发发';
      this.item.tooltip = '股票栏已隐藏，点击显示';
      this.item.show();
      return;
    }

    if (stocks.length === 0) {
      this.item.text = '$(graph) 发发发';
      this.item.tooltip = '点击添加股票';
      this.item.show();
      return;
    }

    const getData = (code: string) => this.manager.getStockData(code);
    const percents = buildStockStatusText(stocks, getData);
    this.item.text = `$(graph) ${percents}`;
    this.item.tooltip = buildStockStatusTooltip(stocks, getData);
    this.item.show();
  }

  /** 释放状态栏项 */
  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

/** 弹出发发发控制菜单 */
export async function showFafafaMenu(
  manager: StockManager,
  openSettings: () => void
): Promise<void> {
  const visible = manager.getVisible();
  const items: vscode.QuickPickItem[] = [
    {
      label: visible ? '$(eye-closed) 隐藏股票栏' : '$(eye) 显示股票栏',
      description: visible ? '隐藏状态栏中的股票涨跌幅' : '在状态栏显示股票涨跌幅',
    },
    {
      label: '$(gear) 打开设置',
      description: '管理股票列表',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '发发发',
  });

  if (!picked) {
    return;
  }

  if (picked.label.includes('隐藏') || picked.label.includes('显示')) {
    await manager.toggleVisible();
  } else if (picked.label.includes('打开设置')) {
    openSettings();
  }
}
