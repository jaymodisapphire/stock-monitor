import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decodeTick, connectStream } from '@/lib/yahooStream';
import { encodeTick, FakeWS } from './helpers';

describe('decodeTick (protobuf)', () => {
  it('decodes symbol, price, time (ms→s), volume and day high', () => {
    const t = decodeTick(encodeTick({ id: 'RELIANCE.NS', price: 2901.35, time: 1763280000000, volume: 1234567, dayHigh: 2950.5 }));
    expect(t).toEqual({ symbol: 'RELIANCE.NS', price: 2901.35, time: 1763280000, volume: 1234567, dayHigh: 2950.5 });
  });
  it('rounds float32 noise (150.1 stays 150.1)', () => expect(decodeTick(encodeTick({ id: 'A', price: 150.1 })).price).toBe(150.1));
  it('skips fields it does not know (name, open price) without breaking', () => {
    const t = decodeTick(encodeTick({ id: 'AAPL', price: 190.25, time: 1763280000000, name: 'Apple Inc.', open: 188, volume: 99 }));
    expect(t).toMatchObject({ symbol: 'AAPL', price: 190.25, volume: 99 });
  });
  it('accepts a time already in seconds and fills a missing time with now', () => {
    expect(decodeTick(encodeTick({ id: 'A', price: 1, time: 1763280000 })).time).toBe(1763280000);
    expect(Math.abs(decodeTick(encodeTick({ id: 'A', price: 1 })).time - Date.now() / 1000)).toBeLessThan(5);
  });
  it('returns null for garbage, missing price or missing symbol', () => {
    expect(decodeTick('!!!not-base64')).toBeNull();
    expect(decodeTick('')).toBeNull();
    expect(decodeTick(encodeTick({ id: 'A', price: 0 }))).toBeNull();
    expect(decodeTick(btoa(String.fromCharCode(21, 0, 0, 128, 63)))).toBeNull();   // price but no symbol
  });
});

describe('connectStream', () => {
  let status, ticks, conn;
  const start = (symbols = ['AAPL', 'TSLA']) => { conn = connectStream({ symbols, onStatus: s => status.push(s), onTick: t => ticks.push(t), WS: FakeWS }); return FakeWS.all.at(-1); };
  beforeEach(() => { vi.useFakeTimers(); FakeWS.all = []; status = []; ticks = []; });
  afterEach(() => { conn?.close(); vi.useRealTimers(); });

  it('connects to Yahoo, subscribes to every symbol on open', () => {
    const ws = start(); expect(ws.url).toBe('wss://streamer.finance.yahoo.com/?version=2');
    ws.open(); expect(JSON.parse(ws.sent[0])).toEqual({ subscribe: ['AAPL', 'TSLA'] });
    expect(status).toEqual(['connecting', 'connected']);
  });
  it('delivers decoded ticks and ignores other / broken messages', () => {
    const ws = start(); ws.open();
    ws.emit({ type: 'pricing', message: encodeTick({ id: 'AAPL', price: 191.5 }) });
    ws.emit({ type: 'heartbeat' }); ws.emit('not json'); ws.emit({ type: 'pricing', message: 'garbage' });
    expect(ticks.map(t => [t.symbol, t.price])).toEqual([['AAPL', 191.5]]);
  });
  it('re-subscribes every 30s as a keep-alive', () => {
    const ws = start(); ws.open(); vi.advanceTimersByTime(60000);
    expect(ws.sent.length).toBe(3);
  });
  it('reconnects with back-off after the socket drops', () => {
    const ws = start(); ws.open(); ws.close();
    expect(status.at(-1)).toBe('offline'); expect(FakeWS.all.length).toBe(1);
    vi.advanceTimersByTime(2000); expect(FakeWS.all.length).toBe(2);     // 1st retry after 2s
    FakeWS.all[1].close(); vi.advanceTimersByTime(3999); expect(FakeWS.all.length).toBe(2);
    vi.advanceTimersByTime(1); expect(FakeWS.all.length).toBe(3);          // 2nd retry after 4s
    FakeWS.all[2].open(); expect(JSON.parse(FakeWS.all[2].sent[0]).subscribe).toEqual(['AAPL', 'TSLA']);
  });
  it('close() stops reconnecting and the keep-alive', () => {
    const ws = start(); ws.open(); conn.close(); const n = ws.sent.length;
    vi.advanceTimersByTime(120000); expect(FakeWS.all.length).toBe(1); expect(ws.sent.length).toBe(n);
  });
  it('treats a constructor failure as offline and retries', () => {
    let calls = 0;
    class Boom { constructor() { calls++; throw new Error('blocked'); } }
    conn = connectStream({ symbols: ['A'], onStatus: s => status.push(s), onTick() {}, WS: Boom });
    expect(status).toEqual(['connecting', 'offline']); vi.advanceTimersByTime(2000); expect(calls).toBe(2);
  });
});
