"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import { sma, ema, bollinger, rsi } from "@/lib/indicators";

const UP = "#26a69a", DOWN = "#ef5350", BLUE = "#2962ff";
const base = {
  autoSize: true,
  layout: { background: { color: "#131722" }, textColor: "#b2b5be" },
  grid: { vertLines: { color: "#1e222d" }, horzLines: { color: "#1e222d" } },
  rightPriceScale: { borderColor: "#2a2e39" }
};
const f = n => (n == null ? "–" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));

export default function PriceChart({ symbol, tf, type, ind, live }) {
  const mainEl = useRef(null), rsiEl = useRef(null);
  const S = useRef(null), data = useRef([]), fit = useRef(true);
  const [legend, setLegend] = useState(null);
  const [err, setErr] = useState("");

  // 1) create both charts and all series once
  useEffect(() => {
    const main = createChart(mainEl.current, { ...base, crosshair: { mode: CrosshairMode.Normal }, timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#2a2e39" } });
    const sub = createChart(rsiEl.current, { ...base, timeScale: { visible: false } });
    main.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } });
    const ln = (o = {}) => main.addLineSeries({ lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false, ...o });
    const s = {
      candle: main.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN }),
      line: main.addLineSeries({ color: BLUE, lineWidth: 2, visible: false }),
      area: main.addAreaSeries({ lineColor: BLUE, topColor: BLUE + "55", bottomColor: BLUE + "00", visible: false }),
      vol: main.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false }),
      sma: ln({ color: "#f7b500" }), ema: ln({ color: "#e040fb" }),
      bbU: ln({ color: "#2196f3" }), bbM: ln({ color: "#2196f3", lineStyle: 2 }), bbL: ln({ color: "#2196f3" }),
      rsi: sub.addLineSeries({ color: "#b388ff", lineWidth: 1, priceLineVisible: false, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) })
    };
    main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    [70, 30].forEach(price => s.rsi.createPriceLine({ price, color: "#787b86", lineStyle: 2, lineWidth: 1, axisLabelVisible: false }));
    main.timeScale().subscribeVisibleLogicalRangeChange(r => r && sub.timeScale().setVisibleLogicalRange(r));
    sub.timeScale().subscribeVisibleLogicalRangeChange(r => r && main.timeScale().setVisibleLogicalRange(r));
    main.subscribeCrosshairMove(p => {
      const d = data.current;
      const bar = p.time ? d.find(x => x.time === p.time) : d[d.length - 1];
      if (bar) setLegend(bar);
    });
    S.current = { ...s, main };
    return () => { main.remove(); sub.remove(); S.current = null; };
  }, []);

  // 2) load candles for the selected symbol + timeframe, refresh every 30s
  useEffect(() => {
    let alive = true;
    fit.current = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&tf=${tf}`);
        const d = await r.json();
        if (!r.ok || !Array.isArray(d)) throw new Error(d.error || "failed");
        if (!alive || !S.current) return;
        data.current = d; setErr("");
        const s = S.current;
        s.candle.setData(d.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
        const closes = d.map(x => ({ time: x.time, close: x.close }));
        s.line.setData(closes.map(x => ({ time: x.time, value: x.close })));
        s.area.setData(closes.map(x => ({ time: x.time, value: x.close })));
        s.vol.setData(d.map(x => ({ time: x.time, value: x.volume || 0, color: x.close >= x.open ? UP + "66" : DOWN + "66" })));
        s.sma.setData(sma(closes, 20)); s.ema.setData(ema(closes, 50));
        const b = bollinger(closes); s.bbU.setData(b.upper); s.bbM.setData(b.mid); s.bbL.setData(b.lower);
        s.rsi.setData(rsi(closes, 14));
        setLegend(d[d.length - 1] || null);
        if (fit.current && d.length) { s.main.timeScale().setVisibleLogicalRange({ from: Math.max(0, d.length - 120), to: d.length + 5 }); fit.current = false; }
      } catch { if (alive) setErr("Chart data unavailable for " + symbol); }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [symbol, tf]);

  // 3) show/hide series for chart type + indicators
  useEffect(() => {
    const s = S.current; if (!s) return;
    const v = (x, visible) => x.applyOptions({ visible });
    v(s.candle, type === "candles"); v(s.line, type === "line"); v(s.area, type === "area");
    v(s.vol, !!ind.vol); v(s.sma, !!ind.sma); v(s.ema, !!ind.ema);
    v(s.bbU, !!ind.bb); v(s.bbM, !!ind.bb); v(s.bbL, !!ind.bb);
  }, [type, ind]);

  // 4) live tick: move the last candle with the latest price
  useEffect(() => {
    const s = S.current, d = data.current;
    if (!s || live == null || !d.length) return;
    const b = { ...d[d.length - 1] };
    b.close = live; b.high = Math.max(b.high, live); b.low = Math.min(b.low, live);
    d[d.length - 1] = b;
    s.candle.update({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });
    s.line.update({ time: b.time, value: live }); s.area.update({ time: b.time, value: live });
  }, [live]);

  return (
    <div className="chartwrap">
      <div className="legend">
        <b>{symbol}</b> · {tf}
        {legend && <span className={legend.close >= legend.open ? "up" : "dn"}> O {f(legend.open)} H {f(legend.high)} L {f(legend.low)} C {f(legend.close)} Vol {f(legend.volume)}</span>}
      </div>
      {err && <div className="cerr">{err}</div>}
      <div ref={mainEl} className="cmain" />
      <div ref={rsiEl} className={"crsi" + (ind.rsi ? "" : " off")}><span className="rl">RSI 14</span></div>
    </div>
  );
}
