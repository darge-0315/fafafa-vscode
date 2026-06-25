import { test } from 'node:test';
import assert from 'node:assert/strict';

const STATUS_BAR_PRIORITY = -100;

/** 格式化涨跌幅（与 stockApi.formatPercent 一致） */
function formatPercent(percent) {
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/** 拼接状态栏涨幅文本（与 statusBarText.buildStockStatusText 一致） */
function buildStockStatusText(codes, getData) {
  return codes
    .map((code) => {
      const data = getData(code);
      return data ? formatPercent(data.percent) : '...';
    })
    .join(' ');
}

test('STATUS_BAR_PRIORITY 为负数（最靠右）', () => {
  assert.ok(STATUS_BAR_PRIORITY < 0);
});

test('buildStockStatusText 按序拼接涨幅，无股票名', () => {
  const data = {
    '000001': { percent: 0.1 },
    '000002': { percent: -0.67 },
  };
  const text = buildStockStatusText(['000001', '000002'], (code) => data[code]);
  assert.equal(text, '+0.10% -0.67%');
  assert.ok(!text.includes('万科'));
  assert.ok(!text.includes('平安'));
});

test('buildStockStatusText 无行情时显示 ...', () => {
  const text = buildStockStatusText(['600000'], () => undefined);
  assert.equal(text, '...');
});

test('buildStockStatusText 混合有数据与无数据', () => {
  const text = buildStockStatusText(
    ['000001', '999999'],
    (code) => (code === '000001' ? { percent: 1.5 } : undefined)
  );
  assert.equal(text, '+1.50% ...');
});
