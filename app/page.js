"use client";
import { useEffect, useRef, useState } from "react";
import PriceChart from "@/components/PriceChart";
import { connectStream } from "@/lib/yahooStream";

const f = n => (n == null ? "–" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const DEFAULT_WL = ["AAPL", "TSLA", "RELIANCE.NS", "TCS.NS"];

export default function Home() {
  const [ready, setReady] = useState(false);
  const [wl, setWl] = useState(DEFAULT_WL);
  const [alerts, setAlerts] = useState([]);
  const [sel, setSel] = useState(DEFAULT_WL[0]);
  const [tf, setTf] = useState("1D");
  const [type, setType] = useState("candles");
  const [ind, setInd] = useState({ vol: true, sma: false, ema: false, bb: false, rsi: false });
  const [quotes, setQuotes] = useState({});
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState("connecting…");
  const [stream, setStream] = useState("connecting");   // connecting | connected | live | offline
  const [ticks, setTicks] = useState({});
  const lastTick = useRef({});
  const [notifLabel, setNotifLabel] = useState("Enable notifications");
  const [toasts, setToasts] = useState([]);
  const [newSym, setNewSym] = useState("");
  const [dir, setDir] = useState("above");
  const [lvl, setLvl] = useState("");
  const [sugg, setSugg] = useState([]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");

  // load saved watchlist + alerts (browser only)
  useEffect(() => {
    try {
      const w = JSON.parse(localStorage.wl || "null");
      if (w?.length) { setWl(w); setSel(w[0]); }
      setAlerts(JSON.parse(localStorage.al || "[]"));
    } catch {}
    if ("Notification" in window && Notification.permission === "granted") setNotifLabel("Notifications on ✓");
    setReady(true);
  }, []);
  useEffect(() => { if (ready) { localStorage.wl = JSON.stringify(wl); localStorage.al = JSON.stringify(alerts); } }, [wl, alerts, ready]);

  const notify = msg => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 8000);
    if ("Notification" in window && Notification.permission === "granted") new Notification("Stock alert", { body: msg });
    try { const c = new AudioContext(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); o.stop(c.currentTime + 0.25); } catch {}
  };

  // quotes poll: fast fallback (5s) when the stream is down, slow re-sync when it is up
  const pollMs = stream === "live" ? 15000 : stream === "connected" ? 10000 : 5000;
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const poll = async () => {
      try {
        const d = await getJSON("/api/quotes?symbols=" + wl.join(","));
        if (!alive) return;
        setQuotes(qs => {
          const n = { ...qs };
          d.forEach(x => {
            const o = qs[x.symbol], fresh = o && Date.now() - (lastTick.current[x.symbol]?.at || 0) < 20000;
            n[x.symbol] = fresh ? { ...x, price: o.price, change: o.change, pct: o.pct, dayHigh: Math.max(x.dayHigh ?? 0, o.dayHigh ?? 0), dayLow: Math.min(x.dayLow ?? Infinity, o.dayLow ?? Infinity) } : x;
          });
          return n;
        });
        setStatus("● updated " + new Date().toLocaleTimeString());
      } catch { if (alive) setStatus("⚠ connection problem"); }
    };
    poll();
    const id = setInterval(poll, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [wl, ready, pollMs]);

  // real-time stream (WebSocket straight from the browser)
  useEffect(() => {
    if (!ready || !wl.length) return;
    const conn = connectStream({
      symbols: wl,
      onStatus: s => setStream(prev => (s === "connected" && prev === "live" ? prev : s)),
      onTick: t => {
        lastTick.current[t.symbol] = { at: Date.now() };
        setStream("live");
        setTicks(x => ({ ...x, [t.symbol]: t }));
        setQuotes(qs => {
          const o = qs[t.symbol]; if (!o) return qs;
          const prev = o.prevClose ?? (o.change != null ? o.price - o.change : null);
          const change = prev != null ? t.price - prev : o.change;
          return { ...qs, [t.symbol]: { ...o, price: t.price, change, pct: prev ? (change / prev) * 100 : o.pct,
            dayHigh: Math.max(o.dayHigh ?? t.price, t.price), dayLow: Math.min(o.dayLow ?? t.price, t.price) } };
        });
      }
    });
    const idle = setInterval(() => {
      if (!Object.values(lastTick.current).some(x => Date.now() - x.at < 30000)) setStream(s => (s === "live" ? "connected" : s));
    }, 5000);
    return () => { conn.close(); clearInterval(idle); };
  }, [wl, ready]);

  // price alerts
  useEffect(() => {
    const fired = [];
    const next = alerts.map(a => {
      const p = quotes[a.sym]?.price;
      if (a.done || p == null) return a;
      if ((a.dir === "above" && p >= a.price) || (a.dir === "below" && p <= a.price)) {
        fired.push(`${a.sym} is ${f(p)} — ${a.dir} your ${f(a.price)} alert`);
        return { ...a, done: true };
      }
      return a;
    });
    if (fired.length) { setAlerts(next); fired.forEach(notify); }
  }, [quotes, alerts]);

  // month / year high-low
  useEffect(() => {
    if (!ready || !sel) return;
    let alive = true;
    const load = () => getJSON("/api/stats?symbol=" + encodeURIComponent(sel)).then(s => alive && setStats(o => ({ ...o, [sel]: s }))).catch(() => {});
    load();
    const id = setInterval(load, 300000);
    return () => { alive = false; clearInterval(id); };
  }, [sel, ready]);

  // search suggestions (debounced)
  useEffect(() => {
    const s = newSym.trim();
    if (!s) { setSugg([]); return; }
    const id = setTimeout(() => getJSON("/api/search?q=" + encodeURIComponent(s)).then(d => { setSugg(Array.isArray(d) ? d : []); setOpen(true); }).catch(() => setSugg([])), 300);
    return () => clearTimeout(id);
  }, [newSym]);

  const addSymbol = async sym => {
    const s = (sym || newSym).trim().toUpperCase();
    if (!s) return;
    setOpen(false);
    if (wl.includes(s)) { setSel(s); setNewSym(""); return; }
    setMsg("");
    try {
      const d = await getJSON("/api/quotes?symbols=" + encodeURIComponent(s));
      if (!d.length) throw new Error("none");
      setQuotes(q => ({ ...q, [d[0].symbol]: d[0] }));
      setWl(w => [...w, s]); setSel(s); setNewSym(""); setSugg([]);
    } catch { setMsg(`"${s}" malyo nahi. Suggestion list mathi select karo (jem ke COALINDIA.NS).`); }
  };
  const onEnter = () => {
    const t = newSym.trim().toUpperCase();
    addSymbol(sugg.find(x => x.symbol === t)?.symbol || sugg[0]?.symbol || t);
  };
  const removeSymbol = s => {
    const next = wl.filter(x => x !== s);
    setWl(next); if (sel === s) setSel(next[0]);
  };
  const addAlert = () => {
    const p = parseFloat(lvl);
    if (!sel || isNaN(p)) return;
    setAlerts([...alerts, { sym: sel, dir, price: p, done: false }]); setLvl("");
  };
  const enableNotif = () => Notification.requestPermission().then(p => setNotifLabel(p === "granted" ? "Notifications on ✓" : "Notifications blocked"));

  const q = quotes[sel], st = stats[sel] || {};
  const Box = ({ l, h, lo }) => (
    <div className="stat"><span>{l}</span><b className="h">H {f(h)}</b> &nbsp; <b className="l">L {f(lo)}</b></div>
  );

  return (
    <>
      <header>
        <h1>📈 Live Stock Monitor</h1>
        <span className="live">{status}</span>
        <span className={"badge " + stream}>{stream === "live" ? "⚡ LIVE stream" : stream === "connected" ? "● Stream connected · waiting for trades" : "↻ Polling every 5s"}</span>
        <button onClick={enableNotif}>{notifLabel}</button>
      </header>
      <main>
        <aside className="card">
          <div className="row" style={{ position: "relative" }}>
            <input value={newSym} onChange={e => { setNewSym(e.target.value); setMsg(""); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={e => e.key === "Enter" && onEnter()} placeholder="Search company or symbol…" />
            <button className="p" onClick={onEnter}>Add</button>
            {open && sugg.length > 0 && (
              <div className="sugg">
                {sugg.map(x => (
                  <div key={x.symbol} className="sg" onMouseDown={() => addSymbol(x.symbol)}>
                    <b>{x.symbol}</b><small>{x.name} · {x.exch}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
          {msg && <div className="dn" style={{ marginBottom: 8, fontSize: 12 }}>{msg}</div>}
          {wl.map(s => {
            const x = quotes[s] || {};
            return (
              <div key={s} className={"item" + (s === sel ? " on" : "")} onClick={() => setSel(s)}>
                <div><b>{s}</b><br /><small>{x.name || ""}</small></div>
                <div style={{ textAlign: "right" }}>
                  {f(x.price)}<br />
                  <small className={x.pct >= 0 ? "up" : "dn"}>{x.pct != null ? (x.pct >= 0 ? "+" : "") + x.pct.toFixed(2) + "%" : ""}</small>
                  <span className="x" onClick={e => { e.stopPropagation(); removeSymbol(s); }}>✕</span>
                </div>
              </div>
            );
          })}
        </aside>
        <section className="card">
          <div className="top">
            <div>
              <div style={{ color: "var(--mu)" }}>{q ? `${q.name || sel} · ${q.state || ""}` : sel}</div>
              <div className="price">{q ? `${f(q.price)} ${q.currency || ""}` : "–"}</div>
              {q && <div className={q.change >= 0 ? "up" : "dn"}>{q.change >= 0 ? "▲" : "▼"} {f(Math.abs(q.change))} ({f(q.pct)}%)</div>}
            </div>
          </div>
          <div className="toolbar">
            {["1m", "5m", "15m", "1h", "1D", "1W", "1M"].map(t => <button key={t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t}</button>)}
            <span className="sep" />
            {[["candles", "Candles"], ["line", "Line"], ["area", "Area"]].map(([k, l]) => <button key={k} className={type === k ? "on" : ""} onClick={() => setType(k)}>{l}</button>)}
            <span className="sep" />
            {[["vol", "Volume"], ["sma", "SMA 20"], ["ema", "EMA 50"], ["bb", "Bollinger"], ["rsi", "RSI"]].map(([k, l]) => <button key={k} className={ind[k] ? "on" : ""} onClick={() => setInd(i => ({ ...i, [k]: !i[k] }))}>{l}</button>)}
          </div>
          {sel && <PriceChart symbol={sel} tf={tf} type={type} ind={ind} tick={ticks[sel]} />}
          <div className="stats">
            <Box l="Today" h={q?.dayHigh} lo={q?.dayLow} />
            <Box l="Last month" h={st.month?.high} lo={st.month?.low} />
            <Box l="Last year" h={st.year?.high} lo={st.year?.low} />
          </div>
          <h3>Price alerts</h3>
          <div className="row">
            <select value={dir} onChange={e => setDir(e.target.value)}>
              <option value="above">Rises above</option><option value="below">Falls below</option>
            </select>
            <input type="number" step="any" value={lvl} onChange={e => setLvl(e.target.value)} placeholder="Price" />
            <button className="p" onClick={addAlert}>Set alert</button>
          </div>
          {alerts.length === 0 && <small style={{ color: "var(--mu)" }}>No alerts yet</small>}
          {alerts.map((a, i) => (
            <div key={i} className={"al" + (a.done ? " done" : "")}>
              <span>{a.sym} {a.dir === "above" ? "≥" : "≤"} {f(a.price)} {a.done ? "(triggered)" : ""}</span>
              <span className="x" onClick={() => setAlerts(alerts.filter((_, j) => j !== i))}>✕</span>
            </div>
          ))}
        </section>
      </main>
      <footer className="attr">Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a> · Data: Yahoo Finance (may be delayed)</footer>
      <div id="toasts">{toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}</div>
    </>
  );
}
