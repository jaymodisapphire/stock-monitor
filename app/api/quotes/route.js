import { NextResponse } from 'next/server';
import { chart, cache } from '@/lib/yahoo';

export const dynamic = 'force-dynamic';

async function one(symbol) {
  const { meta: m } = await chart(symbol, '1d', '1d');
  const prev = m.chartPreviousClose ?? m.previousClose;
  const price = m.regularMarketPrice;
  const now = Date.now() / 1000, reg = m.currentTradingPeriod?.regular;
  return {
    symbol: m.symbol, name: m.shortName || m.longName, currency: m.currency,
    state: reg && now >= reg.start && now <= reg.end ? 'OPEN' : 'CLOSED',
    price, prevClose: prev ?? null, change: prev != null ? price - prev : null, pct: prev ? ((price - prev) / prev) * 100 : null,
    dayHigh: m.regularMarketDayHigh, dayLow: m.regularMarketDayLow
  };
}

export async function GET(req) {
  const s = (new URL(req.url).searchParams.get('symbols') || '').split(',').filter(Boolean).slice(0, 20);
  if (!s.length) return NextResponse.json([]);
  const r = await Promise.allSettled(s.map(one));
  const data = r.filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!data.length) return NextResponse.json({ error: r[0].reason?.message || 'Yahoo request failed' }, { status: 500 });
  return NextResponse.json(data, { headers: cache(5) });
}
