import { NextResponse } from 'next/server';
import { chart, hl, cache } from '@/lib/yahoo';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const symbol = new URL(req.url).searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const { quotes } = await chart(symbol, '1d', '1y');
    return NextResponse.json({ month: hl(quotes.slice(-22)), year: hl(quotes) }, { headers: cache(300) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
