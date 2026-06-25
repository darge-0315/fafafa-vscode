import { test } from 'node:test';
import assert from 'node:assert/strict';

/** 固定不可删除/拖动的默认股票（上证指数） */
const PINNED_STOCKS = ['000001'];

/** 判断股票是否为固定默认项 */
function isPinnedStock(code) {
  return PINNED_STOCKS.includes(code);
}

/** 将股票列表中的固定项按定义顺序置于最前 */
function normalizeStockOrder(codes) {
  const pinned = PINNED_STOCKS.filter((code) => codes.includes(code));
  const rest = codes.filter((code) => !isPinnedStock(code));
  return [...pinned, ...rest];
}

/** 将 6 位股票代码转换为腾讯 API 市场代码 */
function getMarketCode(code) {
  if (code === '000001') {
    return 'sh000001';
  }
  const prefix = code.substring(0, 3);
  if (['600', '601', '603', '688'].includes(prefix)) {
    return `sh${code}`;
  }
  if (['000', '001', '002', '003', '300'].includes(prefix)) {
    return `sz${code}`;
  }
  return '';
}

test('PINNED_STOCKS 包含上证指数 000001', () => {
  assert.deepEqual(PINNED_STOCKS, ['000001']);
});

test('isPinnedStock 识别固定默认项', () => {
  assert.equal(isPinnedStock('000001'), true);
  assert.equal(isPinnedStock('600000'), false);
});

test('normalizeStockOrder 将固定项置于最前', () => {
  assert.deepEqual(
    normalizeStockOrder(['600000', '000001', '000002']),
    ['000001', '600000', '000002']
  );
  assert.deepEqual(normalizeStockOrder(['000002', '600000']), ['000002', '600000']);
});

test('getMarketCode 将 000001 映射为 sh000001', () => {
  assert.equal(getMarketCode('000001'), 'sh000001');
  assert.equal(getMarketCode('600000'), 'sh600000');
  assert.equal(getMarketCode('000002'), 'sz000002');
});
