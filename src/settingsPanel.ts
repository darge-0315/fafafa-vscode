import * as vscode from 'vscode';

import * as fs from 'fs';

import { StockManager } from './stockManager';
import { isPinnedStock } from './stockConstants';



/** 管理发发发设置 Webview 面板 */

export class SettingsPanel {

  private static currentPanel: SettingsPanel | undefined;

  private readonly panel: vscode.WebviewPanel;

  private readonly disposables: vscode.Disposable[] = [];

  private isEditing = false;



  private constructor(

    panel: vscode.WebviewPanel,

    private readonly extensionUri: vscode.Uri,

    private readonly manager: StockManager

  ) {

    this.panel = panel;

    this.panel.webview.html = this.getHtml();



    this.disposables.push(

      this.panel.onDidDispose(() => this.dispose()),

      this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg)),

      manager.onDidChange(() => {

        if (!this.isEditing) {

          this.sendUpdate();

        }

      })

    );



    this.sendUpdate();

  }



  /** 打开或聚焦设置面板 */

  static show(extensionUri: vscode.Uri, manager: StockManager): void {

    if (SettingsPanel.currentPanel) {

      SettingsPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);

      if (!SettingsPanel.currentPanel.isEditing) {

        SettingsPanel.currentPanel.sendUpdate();

      }

      return;

    }



    const panel = vscode.window.createWebviewPanel(

      'fafafaSettings',

      '发发发 设置',

      vscode.ViewColumn.One,

      {

        enableScripts: true,

        retainContextWhenHidden: true,

        localResourceRoots: [

          extensionUri,

          vscode.Uri.joinPath(extensionUri, 'media'),

        ],

      }

    );



    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri, manager);

  }



  /** 构建 Webview HTML */

  private getHtml(): string {

    const webview = this.panel.webview;

    const nonce = getNonce();



    const htmlPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.html');

    let html = fs.readFileSync(htmlPath.fsPath, 'utf-8');



    const styleUri = webview.asWebviewUri(

      vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.css')

    );

    const iconUri = webview.asWebviewUri(

      vscode.Uri.joinPath(this.extensionUri, 'images', 'icon.png')

    );



    const corePath = vscode.Uri.joinPath(this.extensionUri, 'media', 'settingsCore.js');

    const bootPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.js');

    const inlineScript =

      fs.readFileSync(corePath.fsPath, 'utf-8') +

      '\n' +

      fs.readFileSync(bootPath.fsPath, 'utf-8');



    html = html

      .replace(/{{cspSource}}/g, webview.cspSource)

      .replace(/{{nonce}}/g, nonce)

      .replace('{{styleUri}}', styleUri.toString())

      .replace('{{iconUri}}', iconUri.toString())

      .replace('{{inlineScript}}', inlineScript);



    return html;

  }



  /** 向 Webview 发送最新股票列表 */

  private sendUpdate(addSuccess = false): void {

    const stocks = this.manager.getStocks().map((code) => {

      const data = this.manager.getStockData(code);

      return {

        code,

        name: data?.name ?? '',

        percent: data?.percent,

        pinned: isPinnedStock(code),

      };

    });



    this.panel.webview.postMessage({ type: 'update', stocks, addSuccess });

  }



  /** 处理 Webview 消息 */

  private async handleMessage(msg: {

    type: string;

    code?: string;

    codes?: string[];

    active?: boolean;

  }): Promise<void> {

    switch (msg.type) {

      case 'ready':

        this.sendUpdate();

        break;

      case 'editing':

        this.isEditing = msg.active === true;

        break;

      case 'remove':

        if (msg.code) {

          await this.manager.removeStock(msg.code);

        }

        break;

      case 'reorder':

        if (msg.codes) {

          await this.manager.reorderStocks(msg.codes);

        }

        break;

      case 'add':

        if (msg.code) {

          const stocks = this.manager.getStocks();

          if (stocks.includes(msg.code)) {

            this.panel.webview.postMessage({

              type: 'addFailed',

              message: '该股票已存在',

            });

            return;

          }

          const ok = await this.manager.addStock(msg.code);

          if (ok) {

            this.isEditing = false;

            this.sendUpdate(true);

          } else {

            this.panel.webview.postMessage({

              type: 'addFailed',

              message: '无效的股票代码',

            });

          }

        }

        break;

    }

  }



  /** 释放面板资源 */

  private dispose(): void {

    SettingsPanel.currentPanel = undefined;

    for (const d of this.disposables) {

      d.dispose();

    }

    this.panel.dispose();

  }

}



/** 生成 CSP nonce */

function getNonce(): string {

  let text = '';

  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < 32; i++) {

    text += possible.charAt(Math.floor(Math.random() * possible.length));

  }

  return text;

}


