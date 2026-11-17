import { NextResponse } from 'next/server';
import { chart, cache } from '@/lib/yahoo';

export const dynamic = 'force-dynamic';

// timeframe -> [yahoo interval, yahoo range]
const TF = {
  '1m': ['1m', '5d'], '5m': ['5m', '5d'], '15m': ['15m', '1mo'], '1h': ['60m', '3mo'],
  '1D': ['1d', '2y'], '1W': ['1wk', '10y'], '1M': ['1mo', 'max']
};

export async function GET(req) {
  try {
    const p = new URL(req.url).searchParams;
    const symbol = p.get('symbol'), tf = p.get('tf') || '1D', c = TF[tf];
    if (!symbol || !c) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const { meta, quotes } = await chart(symbol, c[0], c[1]);
    const off = meta.gmtoffset || 0; // show times in the exchange's local time
    const bars = new Map();
    for (const x of quotes) {
      const time = Math.floor(x.date.getTime() / 1000) + off;
      bars.set(time, { time, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume });
    }
    const out = [...bars.values()].sort((a, b) => a.time - b.time);
    return NextResponse.json(out, { headers: { ...cache(10), 'x-gmtoffset': String(off) } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
