import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as quotes } from '@/app/api/quotes/route';
import { GET as chartRoute } from '@/app/api/chart/route';
import { GET as stats } from '@/app/api/stats/route';
import { GET as search } from '@/app/api/search/route';

const ok = body => ({ ok: true, status: 200, json: async () => body });
const bad = status => ({ ok: false, status, json: async () => ({}) });
const ts = s => Date.parse(s) / 1000;
const yahoo = (meta, rows) => ok({ chart: { result: [{ meta, timestamp: rows.map(r => r[0]),
  indicators: { quote: [{ open: rows.map(r => r[4] ?? r[1]), volume: rows.map(r => r[5] ?? 100), close: rows.map(r => r[1]), high: rows.map(r => r[2] ?? r[1]), low: rows.map(r => r[3] ?? r[1]) }] } }] } });
const req = (path, qs) => new Request('http://x/api/' + path + '?' + new URLSearchParams(qs));
const now = Date.now() / 1000;
let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });

describe('/api/quotes', () => {
  const meta = (o = {}) => ({ symbol: 'AAPL', shortName: 'Apple Inc.', currency: 'USD', chartPreviousClose: 100,
    regularMarketPrice: 110, regularMarketDayHigh: 112, regularMarketDayLow: 99,
    currentTradingPeriod: { regular: { start: now - 3600, end: now + 3600 } }, ...o });

  it('returns price, change, percent, day high/low and OPEN state', async () => {
    fetchMock.mockResolvedValue(yahoo(meta(), [[now, 110]]));
    const d = await (await quotes(req('quotes', { symbols: 'AAPL' }))).json();
    expect(d[0]).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.', price: 110, change: 10, pct: 10, dayHigh: 112, dayLow: 99, state: 'OPEN' });
  });
  it('reports CLOSED outside trading hours and negative change', async () => {
    fetchMock.mockResolvedValue(yahoo(meta({ regularMarketPrice: 90, currentTradingPeriod: { regular: { start: now - 9e3, end: now - 5e3 } } }), [[now, 90]]));
    const d = await (await quotes(req('quotes', { symbols: 'AAPL' }))).json();
    expect(d[0].state).toBe('CLOSED'); expect(d[0].change).toBe(-10); expect(d[0].pct).toBe(-10);
  });
  it('keeps valid symbols when one fails', async () => {
    fetchMock.mockImplementation(async url => url.includes('/AAPL?') ? yahoo(meta(), [[now, 110]]) : bad(404));
    const d = await (await quotes(req('quotes', { symbols: 'AAPL,ZZZZ' }))).json();
    expect(d.map(x => x.symbol)).toEqual(['AAPL']);
  });
  it('returns 500 with a message when every symbol fails', async () => {
    fetchMock.mockResolvedValue(bad(403));
    const r = await quotes(req('quotes', { symbols: 'AAPL' }));
    expect(r.status).toBe(500); expect((await r.json()).error).toMatch(/403/);
  });
  it('falls back to query2 when query1 fails', async () => {
    fetchMock.mockResolvedValueOnce(bad(403)).mockResolvedValueOnce(yahoo(meta(), [[now, 110]]));
    const r = await quotes(req('quotes', { symbols: 'AAPL' }));
    expect(r.status).toBe(200); expect(fetchMock.mock.calls[1][0]).toContain('query2');
  });
  it('returns [] for empty symbols', async () => {
    expect(await (await quotes(req('quotes', { symbols: '' }))).json()).toEqual([]);
  });
});

describe('/api/chart (candles)', () => {
  it('returns OHLCV bars, sorted, de-duplicated, null bars dropped, shifted to exchange time', async () => {
    fetchMock.mockResolvedValue(yahoo({ gmtoffset: -18000 }, [
      [200, 2, 3, 1, 1.5, 50], [100, 1, 2, 0.5, 0.8, 10], [200, 2.2, 3.2, 1.2, 1.6, 60], [300, null]]));
    const d = await (await chartRoute(req('chart', { symbol: 'AAPL', tf: '5m' }))).json();
    expect(d).toEqual([
      { time: 100 - 18000, open: 0.8, high: 2, low: 0.5, close: 1, volume: 10 },
      { time: 200 - 18000, open: 1.6, high: 3.2, low: 1.2, close: 2.2, volume: 60 }]);   // later duplicate wins
  });
  it.each([['1m', '1m', '5d'], ['5m', '5m', '5d'], ['15m', '15m', '1mo'], ['1h', '60m', '3mo'],
           ['1D', '1d', '2y'], ['1W', '1wk', '10y'], ['1M', '1mo', 'max']])('timeframe %s → interval %s range %s', async (tf, i, r) => {
    fetchMock.mockResolvedValue(yahoo({}, [[now, 5]]));
    await chartRoute(req('chart', { symbol: 'AAPL', tf }));
    expect(fetchMock.mock.calls[0][0]).toContain(`interval=${i}&range=${r}`);
  });
  it('defaults to 1D; rejects unknown timeframe or missing symbol with 400', async () => {
    fetchMock.mockResolvedValue(yahoo({}, [[now, 5]]));
    await chartRoute(req('chart', { symbol: 'AAPL' }));
    expect(fetchMock.mock.calls[0][0]).toContain('interval=1d&range=2y');
    expect((await chartRoute(req('chart', { symbol: 'AAPL', tf: '9y' }))).status).toBe(400);
    expect((await chartRoute(req('chart', { tf: '1D' }))).status).toBe(400);
  });
});

describe('/api/stats', () => {
  it('computes month (last 22 sessions) and year high/low', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => [now - (30 - i) * 864e2, i + 5, i + 10, i]);
    fetchMock.mockResolvedValue(yahoo({}, rows));
    const d = await (await stats(req('stats', { symbol: 'AAPL' }))).json();
    expect(d.year).toEqual({ high: 39, low: 0 });
    expect(d.month).toEqual({ high: 39, low: 8 });
  });
});

describe('/api/search', () => {
  it('returns equities/ETFs only, mapped for the dropdown', async () => {
    fetchMock.mockResolvedValue(ok({ quotes: [
      { symbol: 'COALINDIA.NS', quoteType: 'EQUITY', shortname: 'COAL INDIA LTD', exchDisp: 'NSE' },
      { symbol: 'AAPL250101C', quoteType: 'OPTION' }, { symbol: 'COAL', quoteType: 'ETF', longname: 'Coal ETF', exchange: 'NYQ' }] }));
    const d = await (await search(req('search', { q: 'coal' }))).json();
    expect(d).toEqual([{ symbol: 'COALINDIA.NS', name: 'COAL INDIA LTD', exch: 'NSE' }, { symbol: 'COAL', name: 'Coal ETF', exch: 'NYQ' }]);
  });
  it('empty query → []; upstream failure → 500', async () => {
    expect(await (await search(req('search', { q: '' }))).json()).toEqual([]);
    fetchMock.mockResolvedValue(bad(403));
    expect((await search(req('search', { q: 'x' }))).status).toBe(500);
  });
});
