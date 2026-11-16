// Pure indicator maths. Input: [{ time, close }] → output: [{ time, value }]
export const sma = (d, n) => {
  const out = []; let sum = 0;
  d.forEach((x, i) => {
    sum += x.close; if (i >= n) sum -= d[i - n].close;
    if (i >= n - 1) out.push({ time: x.time, value: sum / n });
  });
  return out;
};

export const ema = (d, n) => {
  const k = 2 / (n + 1), out = []; let prev;
  d.forEach((x, i) => {
    if (i < n - 1) return;
    prev = i === n - 1 ? d.slice(0, n).reduce((s, y) => s + y.close, 0) / n : x.close * k + prev * (1 - k);
    out.push({ time: x.time, value: prev });
  });
  return out;
};

export const bollinger = (d, n = 20, mult = 2) => {
  const upper = [], mid = [], lower = [];
  for (let i = n - 1; i < d.length; i++) {
    const w = d.slice(i - n + 1, i + 1).map(x => x.close);
    const m = w.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n);
    const time = d[i].time;
    upper.push({ time, value: m + mult * sd }); mid.push({ time, value: m }); lower.push({ time, value: m - mult * sd });
  }
  return { upper, mid, lower };
};

// Wilder's RSI
export const rsi = (d, n = 14) => {
  if (d.length <= n) return [];
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const c = d[i].close - d[i - 1].close; c >= 0 ? (g += c) : (l -= c); }
  g /= n; l /= n;
  const val = () => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  const out = [{ time: d[n].time, value: val() }];
  for (let i = n + 1; i < d.length; i++) {
    const c = d[i].close - d[i - 1].close;
    g = (g * (n - 1) + Math.max(c, 0)) / n; l = (l * (n - 1) + Math.max(-c, 0)) / n;
    out.push({ time: d[i].time, value: val() });
  }
  return out;
};
