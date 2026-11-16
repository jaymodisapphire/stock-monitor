import { NextResponse } from 'next/server';
import { chart, cache } from '@/lib/yahoo';

export const dynamic = 'force-dynamic';

const R = { '1d': ['5m', '5d'], '1mo': ['1d', '1mo'], '1y': ['1d', '1y'] };

export async function GET(req) {
  try {
    const p = new URL(req.url).searchParams;
    const symbol = p.get('symbol'), range = p.get('range') || '1d', c = R[range];
    if (!symbol || !c) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const { meta, quotes } = await chart(symbol, c[0], c[1]);
    let q = quotes;
    if (range === '1d' && q.length) {
      const tz = meta.exchangeTimezoneName || 'UTC';
      const day = d => d.toLocaleDateString('en-CA', { timeZone: tz });
      const last = day(q.at(-1).date);
      q = q.filter(x => day(x.date) === last);
    }
    return NextResponse.json(q.map(x => ({ t: x.date, c: x.close })), { headers: cache(15) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
