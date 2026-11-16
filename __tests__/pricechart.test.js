// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

const made = { charts: [] };
vi.mock('lightweight-charts', () => {
  const series = () => ({ setData: vi.fn(), update: vi.fn(), applyOptions: vi.fn(), createPriceLine: vi.fn() });
  const chart = () => {
    const c = { series: [], crosshair: null, remove: vi.fn(),
      addCandlestickSeries: () => (c.series.push(['candle', series()]), c.series.at(-1)[1]),
      addLineSeries: () => (c.series.push(['line', series()]), c.series.at(-1)[1]),
      addAreaSeries: () => (c.series.push(['area', series()]), c.series.at(-1)[1]),
      addHistogramSeries: () => (c.series.push(['hist', series()]), c.series.at(-1)[1]),
      priceScale: () => ({ applyOptions: vi.fn() }),
      timeScale: () => ({ subscribeVisibleLogicalRangeChange: vi.fn(), setVisibleLogicalRange: vi.fn() }),
      subscribeCrosshairMove: fn => { c.crosshair = fn; } };
    made.charts.push(c); return c;
  };
  return { createChart: chart, CrosshairMode: { Normal: 0 } };
});
import PriceChart from '@/components/PriceChart';

const BARS = Array.from({ length: 60 }, (_, i) => ({ time: 1000 + i * 60, open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i, volume: 1000 + i }));
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(50); }); };
const ind = (o = {}) => ({ vol: true, sma: false, ema: false, bb: false, rsi: false, ...o });
const seriesOf = (chart, kind) => chart.series.filter(([k]) => k === kind).map(([, s]) => s);
let respond;
beforeEach(() => {
  vi.useFakeTimers(); made.charts.length = 0;
  respond = () => Promise.resolve({ ok: true, json: async () => BARS });
  vi.stubGlobal('fetch', vi.fn(u => respond(u)));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('PriceChart', () => {
  it('requests candles for symbol + timeframe and feeds every series', async () => {
    render(<PriceChart symbol="AAPL" tf="15m" type="candles" ind={ind()} live={null} />); await flush();
    expect(fetch.mock.calls[0][0]).toBe('/api/chart?symbol=AAPL&tf=15m');
    const [main, sub] = made.charts;
    const candle = seriesOf(main, 'candle')[0];
    expect(candle.setData).toHaveBeenCalledWith(expect.arrayContaining([{ time: 1000, open: 100, high: 105, low: 95, close: 102 }]));
    expect(candle.setData.mock.calls[0][0]).toHaveLength(60);
    const hist = seriesOf(main, 'hist')[0].setData.mock.calls[0][0];
    expect(hist[0]).toMatchObject({ time: 1000, value: 1000 });
    expect(seriesOf(sub, 'line')[0].setData.mock.calls[0][0].length).toBe(46);   // RSI(14) on 60 bars
  });
  it('shows the latest bar in the OHLC legend and updates it on crosshair move', async () => {
    render(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={null} />); await flush();
    expect(screen.getByText(/O 159 H 164 L 154 C 161/)).toBeTruthy();
    act(() => made.charts[0].crosshair({ time: 1000 }));
    expect(screen.getByText(/O 100 H 105 L 95 C 102/)).toBeTruthy();
    act(() => made.charts[0].crosshair({}));                       // mouse leaves → back to last bar
    expect(screen.getByText(/O 159/)).toBeTruthy();
  });
  it('switches visible series with chart type and indicator toggles', async () => {
    const { rerender } = render(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={null} />); await flush();
    const main = made.charts[0]; const [candle, line, area] = [seriesOf(main, 'candle')[0], seriesOf(main, 'line')[0], seriesOf(main, 'area')[0]];
    const last = s => s.applyOptions.mock.calls.at(-1)[0].visible;
    expect([last(candle), last(line), last(area)]).toEqual([true, false, false]);
    rerender(<PriceChart symbol="AAPL" tf="1D" type="area" ind={ind({ sma: true, bb: true, vol: false })} live={null} />);
    expect([last(candle), last(line), last(area)]).toEqual([false, false, true]);
    const lines = seriesOf(main, 'line');                           // [price line, sma, ema, bbU, bbM, bbL]
    expect(lines.map(last)).toEqual([false, true, false, true, true, true]);
    expect(last(seriesOf(main, 'hist')[0])).toBe(false);
  });
  it('RSI panel is hidden until RSI is enabled', async () => {
    const { container, rerender } = render(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={null} />); await flush();
    expect(container.querySelector('.crsi').className).toContain('off');
    rerender(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind({ rsi: true })} live={null} />);
    expect(container.querySelector('.crsi').className).not.toContain('off');
  });
  it('live price moves the last candle (close, and extends high/low)', async () => {
    const { rerender } = render(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={null} />); await flush();
    const candle = seriesOf(made.charts[0], 'candle')[0];
    rerender(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={170} />);
    expect(candle.update).toHaveBeenLastCalledWith({ time: 1000 + 59 * 60, open: 159, high: 170, low: 154, close: 170 });
    rerender(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={150} />);
    expect(candle.update).toHaveBeenLastCalledWith({ time: 1000 + 59 * 60, open: 159, high: 170, low: 150, close: 150 });
  });
  it('refreshes candles every 30 seconds', async () => {
    render(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={null} />); await flush();
    const n = fetch.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetch.mock.calls.length).toBe(n + 1);
  });
  it('shows an error message when chart data cannot be loaded', async () => {
    respond = () => Promise.resolve({ ok: false, json: async () => ({ error: 'Yahoo returned 403' }) });
    render(<PriceChart symbol="ZZZ" tf="1D" type="candles" ind={ind()} live={null} />); await flush();
    expect(screen.getByText(/Chart data unavailable for ZZZ/)).toBeTruthy();
  });
  it('reloads when timeframe changes, and cleans up charts on unmount', async () => {
    const { rerender, unmount } = render(<PriceChart symbol="AAPL" tf="1D" type="candles" ind={ind()} live={null} />); await flush();
    rerender(<PriceChart symbol="AAPL" tf="1h" type="candles" ind={ind()} live={null} />); await flush();
    expect(fetch.mock.calls.at(-1)[0]).toBe('/api/chart?symbol=AAPL&tf=1h');
    unmount(); expect(made.charts.every(c => c.remove.mock.calls.length === 1)).toBe(true);
  });
});
