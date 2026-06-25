import * as https from 'https';
import * as iconv from 'iconv-lite';

/** 股票行情数据结构 */
export interface StockData {
  code: string;
  name: string;
  current: number;
  yesterday: number;
  change: number;
  percent: number;
}

/** 判断当前是否处于工作日 9:15–15:05 交易刷新窗口 */
export function isWithinTradingUpdateWindow(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) {
    return false;
  }
  const minutes = d.getHours() * 60 + d.getMinutes();
  const start = 9 * 60 + 15;
  const end = 15 * 60 + 5;
  return minutes >= start && minutes <= end;
}

/** 将 6 位股票代码转换为腾讯 API 市场代码 */
export function getMarketCode(code: string): string {
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

/** 根据涨跌幅返回状态栏颜色（红涨绿跌平白） */
export function getStockColor(percent: number): string | undefined {
  if (percent > 0) {
    return '#f44336';
  }
  if (percent < 0) {
    return '#4caf50';
  }
  return undefined;
}

/** 格式化涨跌幅显示文本 */
export function formatPercent(percent: number): string {
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}
/** 通过 HTTPS 请求腾讯财经 API 并返回 GBK 解码后的文本 */
function fetchText(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(iconv.decode(buffer, 'gbk'));
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

/** 拉取并解析单只股票行情数据 */
export async function fetchStockData(code: string): Promise<StockData | null> {
  const marketCode = getMarketCode(code);
  if (!marketCode) {
    return null;
  }

  try {
    const text = await fetchText(`https://qt.gtimg.cn/q=${marketCode}`, 5000);
    const reg = new RegExp(`v_${marketCode}="(.*?)";`);
    const match = text.match(reg);
    if (!match?.[1]) {
      return null;
    }

    const data = match[1].split('~');
    if (data.length < 10 || !data[1]) {
      return null;
    }

    const name = data[1];
    const currentPrice = parseFloat(data[3]);
    const yesterdayClose = parseFloat(data[4]);
    const todayOpen = parseFloat(data[5]);

    if (isNaN(yesterdayClose) || yesterdayClose === 0) {
      return null;
    }

    let priceToUse = currentPrice;
    if (isNaN(currentPrice) || currentPrice === 0) {
      if (!isNaN(todayOpen) && todayOpen > 0) {
        priceToUse = todayOpen;
      } else {
        priceToUse = yesterdayClose;
      }
    }

    const change = priceToUse - yesterdayClose;
    const percent = (change / yesterdayClose) * 100;

    return {
      code,
      name,
      current: priceToUse,
      yesterday: yesterdayClose,
      change,
      percent,
    };
  } catch {
    return null;
  }
}

/** 批量拉取多只股票行情数据 */
export async function fetchStockDataBatch(codes: string[]): Promise<Map<string, StockData>> {
  const result = new Map<string, StockData>();
  await Promise.all(
    codes.map(async (code) => {
      const data = await fetchStockData(code);
      if (data) {
        result.set(code, data);
      }
    })
  );
  return result;
}
