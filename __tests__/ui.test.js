// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('@/components/PriceChart', () => ({ default: p => (
  <div data-testid="chart" data-symbol={p.symbol} data-tf={p.tf} data-type={p.type} data-live={p.live} data-ind={Object.keys(p.ind).filter(k => p.ind[k]).join(',')} />) }));
import Home from '@/app/page';

let prices, notes;
const flush = async (ms = 50) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const json = (b, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => b });
const q = s => ({ symbol: s, name: s + ' Inc', currency: 'USD', state: 'OPEN', price: prices[s], change: 1, pct: 0.5, dayHigh: prices[s] + 2, dayLow: prices[s] - 2 });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  prices = { AAPL: 150.25, TSLA: 200, 'RELIANCE.NS': 2900, 'TCS.NS': 4000, 'COALINDIA.NS': 400 };
  notes = [];
  class N { static permission = 'granted'; static requestPermission = vi.fn(async () => 'granted'); constructor(t, o) { notes.push({ t, ...o }); } }
  vi.stubGlobal('Notification', N); window.Notification = N;
  vi.stubGlobal('fetch', vi.fn(url => {
    const u = new URL(url, 'http://x');
    if (u.pathname === '/api/quotes') {
      const list = u.searchParams.get('symbols').split(',').filter(s => prices[s]).map(q);
      return list.length ? json(list) : json({ error: 'none' }, false);
    }
    if (u.pathname === '/api/chart') return json([{ t: '2026-11-16T10:00:00Z', c: 1 }, { t: '2026-11-16T10:05:00Z', c: 2 }]);
    if (u.pathname === '/api/stats') return json({ month: { high: 180, low: 120 }, year: { high: 220, low: 90 } });
    if (u.pathname === '/api/search') return json(u.searchParams.get('q').toLowerCase().startsWith('coal') ? [{ symbol: 'COALINDIA.NS', name: 'COAL INDIA LTD', exch: 'NSE' }] : []);
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const boot = async () => { render(<Home />); await flush(); };
const setAlert = async (dir, price) => {
  fireEvent.change(screen.getByDisplayValue('Rises above'), { target: { value: dir } });
  fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: String(price) } });
  fireEvent.click(screen.getByText('Set alert')); await flush();
};

describe('watchlist + live data', () => {
  it('shows default watchlist with live prices, status and High/Low cards', async () => {
    await boot();
    expect(screen.getAllByText('150.25').length).toBeGreaterThan(0);
    expect(screen.getByText(/● live/)).toBeTruthy();
    expect(screen.getByText('H 152.25')).toBeTruthy();   // today high
    expect(screen.getByText('H 180')).toBeTruthy();       // last month high
    expect(screen.getByText('L 90')).toBeTruthy();        // last year low
  });
  it('refreshes the price every 10 seconds', async () => {
    await boot(); prices.AAPL = 155.5; await flush(10000);
    expect(screen.getAllByText('155.5').length).toBeGreaterThan(0);
  });
  it('timeframe, chart type and indicator buttons drive the chart', async () => {
    await boot();
    const ch = () => screen.getByTestId('chart').dataset;
    expect(ch()).toMatchObject({ symbol: 'AAPL', tf: '1D', type: 'candles', ind: 'vol' });
    fireEvent.click(screen.getByText('15m')); expect(ch().tf).toBe('15m');
    fireEvent.click(screen.getByText('1W')); expect(ch().tf).toBe('1W');
    fireEvent.click(screen.getByText('Line')); expect(ch().type).toBe('line');
    fireEvent.click(screen.getByText('SMA 20')); fireEvent.click(screen.getByText('RSI'));
    expect(ch().ind).toBe('vol,sma,rsi');
    fireEvent.click(screen.getByText('Volume')); expect(ch().ind).toBe('sma,rsi');
  });
  it('chart follows the selected stock and receives the live price', async () => {
    await boot(); expect(screen.getByTestId('chart').dataset.live).toBe('150.25');
    prices.AAPL = 151; await flush(10000); expect(screen.getByTestId('chart').dataset.live).toBe('151');
    fireEvent.click(screen.getByText('TSLA')); expect(screen.getByTestId('chart').dataset.symbol).toBe('TSLA');
  });
  it('shows "connection problem" when the API fails', async () => {
    fetch.mockImplementation(() => json({ error: 'x' }, false));
    await boot(); expect(screen.getByText(/connection problem/)).toBeTruthy();
  });
});

describe('search + suggestions', () => {
  it('shows suggestions while typing and adds the selected stock', async () => {
    await boot();
    fireEvent.change(screen.getByPlaceholderText('Search company or symbol…'), { target: { value: 'coal' } });
    await flush(350);
    fireEvent.mouseDown(screen.getByText('COALINDIA.NS'));
    await flush();
    expect(screen.getAllByText('COALINDIA.NS').length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.wl)).toContain('COALINDIA.NS');
  });
  it('rejects an unknown symbol with a message and does not add it', async () => {
    await boot();
    fireEvent.change(screen.getByPlaceholderText('Search company or symbol…'), { target: { value: 'ZZZZ' } });
    fireEvent.click(screen.getByText('Add')); await flush();
    expect(screen.getByText(/ZZZZ" malyo nahi/)).toBeTruthy();
    expect(JSON.parse(localStorage.wl || '[]')).not.toContain('ZZZZ');
  });
  it('removes a stock from the watchlist', async () => {
    await boot();
    fireEvent.click(screen.getAllByText('✕')[1]); await flush();   // remove TSLA
    expect(screen.queryByText('TSLA')).toBeNull();
    expect(JSON.parse(localStorage.wl)).not.toContain('TSLA');
  });
});

describe('price alerts + notifications', () => {
  it('does NOT fire while the condition is false', async () => {
    await boot(); await setAlert('above', 160);
    expect(notes.length).toBe(0); expect(screen.getByText(/AAPL ≥ 160/)).toBeTruthy();
  });
  it('fires a browser notification + toast when price rises above the level, only once', async () => {
    await boot(); await setAlert('above', 160);
    prices.AAPL = 161; await flush(10000);
    expect(notes).toEqual([{ t: 'Stock alert', body: 'AAPL is 161 — above your 160 alert' }]);
    expect(screen.getByText('AAPL is 161 — above your 160 alert')).toBeTruthy();
    expect(screen.getByText(/\(triggered\)/)).toBeTruthy();
    prices.AAPL = 170; await flush(10000); await flush(10000);
    expect(notes.length).toBe(1);                                   // no repeat
    expect(JSON.parse(localStorage.al)[0].done).toBe(true);         // persisted
  });
  it('fires immediately for a "falls below" alert that is already true', async () => {
    await boot(); await setAlert('below', 200);
    expect(notes.length).toBe(1); expect(notes[0].body).toContain('below your 200');
  });
  it('toast disappears after 8 seconds', async () => {
    await boot(); await setAlert('below', 200);
    expect(screen.getAllByText(/AAPL is 150.25/).length).toBe(1);
    await flush(8100); expect(screen.queryByText(/AAPL is 150.25/)).toBeNull();
  });
  it('shows the toast but no browser notification when permission is denied', async () => {
    Notification.permission = 'denied';
    await boot(); await setAlert('below', 200);
    expect(notes.length).toBe(0); expect(screen.getAllByText(/AAPL is 150.25/).length).toBe(1);
  });
  it('Enable notifications button requests permission', async () => {
    Notification.permission = 'default';
    await boot(); fireEvent.click(screen.getByText('Enable notifications')); await flush();
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(screen.getByText('Notifications on ✓')).toBeTruthy();
  });
  it('restores saved alerts after a reload and can delete one', async () => {
    localStorage.al = JSON.stringify([{ sym: 'AAPL', dir: 'above', price: 999, done: false }]);
    await boot(); expect(screen.getByText(/AAPL ≥ 999/)).toBeTruthy();
    fireEvent.click(screen.getAllByText('✕').at(-1)); await flush();
    expect(screen.queryByText(/AAPL ≥ 999/)).toBeNull();
  });
});
