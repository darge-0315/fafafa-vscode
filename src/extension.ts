import * as vscode from 'vscode';
import { StockManager } from './stockManager';
import { StatusBarController, showFafafaMenu } from './statusBar';
import { SettingsPanel } from './settingsPanel';

let stockManager: StockManager | undefined;
let statusBar: StatusBarController | undefined;

/** 扩展激活入口 */
export function activate(context: vscode.ExtensionContext): void {
  stockManager = new StockManager(context);
  statusBar = new StatusBarController(stockManager);

  const openSettings = () => {
    SettingsPanel.show(context.extensionUri, stockManager!);
  };

  context.subscriptions.push(
    stockManager,
    statusBar,
    vscode.commands.registerCommand('fafafa.openSettings', openSettings),
    vscode.commands.registerCommand('fafafa.showMenu', () => {
      showFafafaMenu(stockManager!, openSettings);
    }),
    vscode.commands.registerCommand('fafafa.toggleVisibility', () => {
      stockManager!.toggleVisible();
    })
  );

  void stockManager.refreshAll();
  stockManager.startPolling();
}

/** 扩展停用清理 */
export function deactivate(): void {
  stockManager?.dispose();
  statusBar?.dispose();
  stockManager = undefined;
  statusBar = undefined;
}
