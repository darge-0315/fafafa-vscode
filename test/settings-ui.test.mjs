import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { createSettingsUI } = require('../media/settingsCore.js');

/** 创建轻量 DOM 模拟环境 */
function createMockDom() {
  const elements = new Map();

  function createEl(tag, id) {
    const el = {
      tag,
      id,
      className: '',
      textContent: '',
      style: {},
      dataset: {},
      children: [],
      parent: null,
      listeners: {},
      attributes: {},
      get display() { return this.style.display; },
      set display(v) { this.style.display = v; },
      appendChild(child) {
        child.parent = this;
        this.children.push(child);
        if (child.id) {
          elements.set(child.id, child);
        }
      },
      remove() {
        if (this.parent) {
          const idx = this.parent.children.indexOf(this);
          if (idx >= 0) {
            this.parent.children.splice(idx, 1);
          }
          this.parent = null;
        }
        if (this.id) {
          elements.delete(this.id);
        }
      },
      contains(target) {
        if (target === this) {
          return true;
        }
        for (const child of this.children) {
          if (child.contains && child.contains(target)) {
            return true;
          }
        }
        return false;
      },
      addEventListener(type, fn) {
        if (!this.listeners[type]) {
          this.listeners[type] = [];
        }
        this.listeners[type].push(fn);
      },
      focus() {
        document.activeElement = this;
      },
      removeChild() {},
      querySelectorAll() { return []; },
    };
    if (id) {
      el.id = id;
      elements.set(id, el);
    }
    return el;
  }

  const stockListEl = createEl('div', 'stock-list');
  const addRowEl = createEl('div', 'add-row');
  const addBtn = createEl('button', 'add-btn');
  addBtn.style.display = 'flex';
  addRowEl.appendChild(addBtn);

  const document = {
    activeElement: null,
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tag) {
      return createEl(tag);
    },
    addEventListener() {},
  };

  const messages = [];
  const vscode = {
    postMessage(msg) {
      messages.push(msg);
    },
  };

  const window = {
    addEventListener() {},
  };

  return { document, window, vscode, messages, stockListEl, addRowEl, addBtn, elements };
}

/** 查找 add-row 下的 input 元素 */
function findInput(addRowEl) {
  for (const child of addRowEl.children) {
    if (child.className === 'temp-row') {
      for (const sub of child.children) {
        if (sub.className === 'temp-input') {
          return sub;
        }
      }
    }
  }
  return null;
}

test('showTempRow 点击后 add-row 出现 input，+ 按钮隐藏', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.showTempRow();

  assert.equal(ui.getTempRowActive(), true);
  assert.equal(mock.addBtn.style.display, 'none');
  const input = findInput(mock.addRowEl);
  assert.ok(input, '应出现输入框');
  assert.ok(mock.messages.some((m) => m.type === 'editing' && m.active === true));
});

test('removeTempRow 后 input 消失，+ 恢复', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.showTempRow();
  ui.removeTempRow();

  assert.equal(ui.getTempRowActive(), false);
  assert.equal(mock.addBtn.style.display, 'flex');
  assert.equal(findInput(mock.addRowEl), null);
});

test('render 不销毁 add-row 中的临时行', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.showTempRow();
  ui.render();
  assert.ok(findInput(mock.addRowEl), 'render 后输入框仍存在');
});

test('Enter 添加 6 位代码触发 postMessage add', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.showTempRow();
  const input = findInput(mock.addRowEl);
  input.textContent = '';
  input.attributes = { value: '600000' };
  Object.defineProperty(input, 'value', { get: () => '600000', configurable: true });

  const keydownHandlers = input.listeners.keydown || [];
  assert.ok(keydownHandlers.length > 0);
  keydownHandlers[0]({ key: 'Enter' });

  assert.ok(mock.messages.some((m) => m.type === 'add' && m.code === '600000'));
});

test('非法代码不发送 add 消息', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.showTempRow();
  const input = findInput(mock.addRowEl);
  Object.defineProperty(input, 'value', { get: () => '123', configurable: true });

  const before = mock.messages.length;
  const keydownHandlers = input.listeners.keydown || [];
  keydownHandlers[0]({ key: 'Enter' });

  const addMsgs = mock.messages.slice(before).filter((m) => m.type === 'add');
  assert.equal(addMsgs.length, 0);
});

test('update 消息在 tempRowActive 时不触发 render 清空', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.showTempRow();
  const rowsBefore = mock.stockListEl.children.length;
  ui.handleUpdate({ stocks: [{ code: '600000', name: '浦发银行', percent: 1.2 }] });

  assert.ok(findInput(mock.addRowEl), '编辑中 update 不销毁输入框');
  assert.equal(ui.getTempRowActive(), true);
});

test('addSuccess 的 update 会关闭临时行', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.showTempRow();
  ui.handleUpdate({
    stocks: [{ code: '600000', name: '浦发银行', percent: 1.2 }],
    addSuccess: true,
  });

  assert.equal(ui.getTempRowActive(), false);
  assert.equal(findInput(mock.addRowEl), null);
});

test('pinned 行不渲染删除与拖拽按钮', () => {
  const mock = createMockDom();

  const ui = createSettingsUI({
    vscode: mock.vscode,
    document: mock.document,
    window: mock.window,
  });

  ui.handleUpdate({
    stocks: [
      { code: '000001', name: '上证指数', percent: 0.5, pinned: true },
      { code: '600000', name: '浦发银行', percent: 1.2, pinned: false },
    ],
  });

  assert.equal(mock.stockListEl.children.length, 2);

  const pinnedRow = mock.stockListEl.children[0];
  const normalRow = mock.stockListEl.children[1];

  assert.equal(pinnedRow.className, 'stock-row pinned');
  const pinnedButtons = pinnedRow.children.filter((c) => c.className && c.className.includes('btn-icon'));
  assert.equal(pinnedButtons.length, 0);

  const normalButtons = normalRow.children.filter((c) => c.className && c.className.includes('btn-icon'));
  assert.equal(normalButtons.length, 2);
});
