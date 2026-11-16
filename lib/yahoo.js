// Direct calls to Yahoo's public chart endpoint (no cookie/crumb needed)
export const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const HOSTS = ['query1', 'query2'];

export async function chart(symbol, interval, range) {
  let err;
  for (const h of HOSTS) {
    try {
      const url = `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      const r = await fetch(url, { headers: HEADERS, cache: 'no-store' });
      if (!r.ok) throw new Error(`Yahoo returned ${r.status} for ${symbol}`);
      const j = await r.json();
      const res = j.chart?.result?.[0];
      if (!res) throw new Error(j.chart?.error?.description || `No data for ${symbol}`);
      const q = res.indicators.quote[0];
      const quotes = (res.timestamp || [])
        .map((t, i) => ({ date: new Date(t * 1000), close: q.close[i], high: q.high[i], low: q.low[i] }))
        .filter(x => x.close != null && x.high != null && x.low != null);
      return { meta: res.meta, quotes };
    } catch (e) { err = e; }
  }
  throw err;
}

export const hl = a => ({ high: Math.max(...a.map(q => q.high)), low: Math.min(...a.map(q => q.low)) });
export const cache = s => ({ 'Cache-Control': `s-maxage=${s}, stale-while-revalidate=${s * 2}` });
