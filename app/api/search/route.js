import { NextResponse } from 'next/server';
import { HEADERS, cache } from '@/lib/yahoo';

export const dynamic = 'force-dynamic';
const TYPES = ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CRYPTOCURRENCY'];

export async function GET(req) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json([]);
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`, { headers: HEADERS, cache: 'no-store' });
    if (!r.ok) throw new Error(`Yahoo returned ${r.status}`);
    const j = await r.json();
    const data = (j.quotes || [])
      .filter(x => x.symbol && TYPES.includes(x.quoteType))
      .slice(0, 8)
      .map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || '', exch: x.exchDisp || x.exchange || '' }));
    return NextResponse.json(data, { headers: cache(60) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
