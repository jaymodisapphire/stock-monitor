import { describe, it, expect } from 'vitest';
import { sma, ema, bollinger, rsi } from '@/lib/indicators';

const bars = a => a.map((close, i) => ({ time: i + 1, close }));
const v = a => a.map(x => +x.value.toFixed(4));

describe('indicators', () => {
  it('SMA', () => expect(v(sma(bars([1, 2, 3, 4, 5]), 3))).toEqual([2, 3, 4]));
  it('SMA time alignment starts at the n-th bar', () => expect(sma(bars([1, 2, 3, 4]), 3).map(x => x.time)).toEqual([3, 4]));
  it('EMA seeds with SMA then smooths (k = 2/(n+1))', () => expect(v(ema(bars([1, 2, 3, 4, 5]), 3))).toEqual([2, 3, 4]));
  it('EMA reacts to a jump', () => expect(v(ema(bars([10, 10, 10, 20]), 3))).toEqual([10, 15]));
  it('Bollinger: flat prices give zero-width bands; bands straddle the mean', () => {
    const f = bollinger(bars(Array(5).fill(7)), 3);
    expect(v(f.upper)).toEqual([7, 7, 7]); expect(v(f.lower)).toEqual([7, 7, 7]);
    const b = bollinger(bars([1, 2, 3, 4, 5]), 3, 2);   // mean 2, population sd sqrt(2/3)
    expect(+b.mid[0].value.toFixed(4)).toBe(2);
    expect(+b.upper[0].value.toFixed(4)).toBeCloseTo(2 + 2 * Math.sqrt(2 / 3), 3);
    expect(+b.lower[0].value.toFixed(4)).toBeCloseTo(2 - 2 * Math.sqrt(2 / 3), 3);
  });
  it('RSI is 100 when price only rises, ~0 when it only falls, 50 when flat-balanced', () => {
    expect(rsi(bars(Array.from({ length: 20 }, (_, i) => i)), 14).every(x => x.value === 100)).toBe(true);
    expect(rsi(bars(Array.from({ length: 20 }, (_, i) => 20 - i)), 14).every(x => x.value < 1e-9)).toBe(true);
    const alt = rsi(bars(Array.from({ length: 30 }, (_, i) => (i % 2 ? 11 : 10))), 14);
    expect(alt.at(-1).value).toBeGreaterThan(40); expect(alt.at(-1).value).toBeLessThan(60);
  });
  it('RSI matches the textbook Wilder example (14-period)', () => {
    const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(rsi(bars(c), 14)[0].value).toBeCloseTo(70.46, 1);
  });
  it('RSI returns [] when there is not enough data', () => expect(rsi(bars([1, 2, 3]), 14)).toEqual([]));
});
