import * as vscode from 'vscode';
import {
  fetchStockData,
  fetchStockDataBatch,
  isWithinTradingUpdateWindow,
  StockData,
} from './stockApi';
import {
  isPinnedStock,
  normalizeStockOrder,
  PINNED_STOCKS,
} from './stockConstants';

const STOCKS_KEY = 'fafafa.stocks';
const VISIBLE_KEY = 'fafafa.visible';
const REFRESH_INTERVAL = 3000;

/** 管理股票列表、行情缓存与定时刷新 */
export class StockManager implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _stocks: string[] = [];
  private _visible = true;
  private _data = new Map<string, StockData>();
  private _interval: NodeJS.Timeout | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    const stored = context.globalState.get<string[]>(STOCKS_KEY, []);
    this._stocks = this.buildPinnedStockList(stored);
    this._visible = context.globalState.get<boolean>(VISIBLE_KEY, true);
    if (this._stocks.join(',') !== stored.join(',')) {
      void context.globalState.update(STOCKS_KEY, this._stocks);
    }
  }

  /** 合并固定默认股票并归位顺序 */
  private buildPinnedStockList(codes: string[]): string[] {
    let next = [...codes];
    for (const code of PINNED_STOCKS) {
      if (!next.includes(code)) {
        next.unshift(code);
      }
    }
    return normalizeStockOrder(next);
  }

  /** 获取当前股票代码列表 */
  getStocks(): string[] {
    return [...this._stocks];
  }

  /** 获取是否显示状态栏股票项 */
  getVisible(): boolean {
    return this._visible;
  }

  /** 获取指定股票的缓存行情 */
  getStockData(code: string): StockData | undefined {
    return this._data.get(code);
  }

  /** 获取全部缓存行情 */
  getAllStockData(): Map<string, StockData> {
    return new Map(this._data);
  }

  /** 设置股票列表并持久化 */
  async setStocks(codes: string[]): Promise<void> {
    const unique = codes.filter((c, i) => codes.indexOf(c) === i);
    this._stocks = normalizeStockOrder(unique);
    await this.context.globalState.update(STOCKS_KEY, this._stocks);
    await this.refreshAll();
    this._onDidChange.fire();
  }

  /** 仅调整股票顺序，不重新拉取行情 */
  async reorderStocks(codes: string[]): Promise<void> {
    this._stocks = normalizeStockOrder(codes);
    await this.context.globalState.update(STOCKS_KEY, this._stocks);
    this._onDidChange.fire();
  }

  /** 添加单只股票 */
  async addStock(code: string): Promise<boolean> {
    if (this._stocks.includes(code)) {
      return true;
    }
    const data = await fetchStockData(code);
    if (!data) {
      return false;
    }
    this._stocks.push(code);
    this._data.set(code, data);
    if (!this._visible) {
      this._visible = true;
      await this.context.globalState.update(VISIBLE_KEY, true);
    }
    await this.context.globalState.update(STOCKS_KEY, this._stocks);
    this._onDidChange.fire();
    return true;
  }

  /** 删除单只股票 */
  async removeStock(code: string): Promise<void> {
    if (isPinnedStock(code)) {
      return;
    }
    this._stocks = this._stocks.filter((c) => c !== code);
    this._data.delete(code);
    await this.context.globalState.update(STOCKS_KEY, this._stocks);
    this._onDidChange.fire();
  }

  /** 设置状态栏显隐并持久化 */
  async setVisible(visible: boolean): Promise<void> {
    this._visible = visible;
    await this.context.globalState.update(VISIBLE_KEY, visible);
    this._onDidChange.fire();
  }

  /** 切换状态栏显隐 */
  async toggleVisible(): Promise<void> {
    await this.setVisible(!this._visible);
  }

  /** 立即全量刷新行情（任意时段） */
  async refreshAll(): Promise<void> {
    if (this._stocks.length === 0) {
      this._data.clear();
      this._onDidChange.fire();
      return;
    }
    const batch = await fetchStockDataBatch(this._stocks);
    this._data = batch;
    this._onDidChange.fire();
  }

  /** 启动定时刷新（交易时段内每 3 秒） */
  startPolling(): void {
    this.stopPolling();
    this._interval = setInterval(() => {
      if (!isWithinTradingUpdateWindow(new Date())) {
        return;
      }
      void this.refreshAll();
    }, REFRESH_INTERVAL);
  }

  /** 停止定时刷新 */
  stopPolling(): void {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /** 释放资源 */
  dispose(): void {
    this.stopPolling();
    this._onDidChange.dispose();
  }
}
