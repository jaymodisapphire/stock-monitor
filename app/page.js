"use client";
import { useEffect, useRef, useState } from "react";
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

const f = n => (n == null ? "–" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const DEFAULT_WL = ["AAPL", "TSLA", "RELIANCE.NS", "TCS.NS"];

export default function Home() {
  const [ready, setReady] = useState(false);
  const [wl, setWl] = useState(DEFAULT_WL);
  const [alerts, setAlerts] = useState([]);
  const [sel, setSel] = useState(DEFAULT_WL[0]);
  const [range, setRange] = useState("1d");
  const [quotes, setQuotes] = useState({});
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState("connecting…");
  const [notifLabel, setNotifLabel] = useState("Enable notifications");
  const [toasts, setToasts] = useState([]);
  const [newSym, setNewSym] = useState("");
  const [dir, setDir] = useState("above");
  const [lvl, setLvl] = useState("");
  const canvas = useRef(null);
  const chart = useRef(null);

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

  // live quotes every 10s
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const poll = async () => {
      try {
        const d = await getJSON("/api/quotes?symbols=" + wl.join(","));
        if (!alive) return;
        setQuotes(q => ({ ...q, ...Object.fromEntries(d.map(x => [x.symbol, x])) }));
        setStatus("● live · " + new Date().toLocaleTimeString());
      } catch { if (alive) setStatus("⚠ connection problem"); }
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(id); };
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

  // create chart once
  useEffect(() => {
    chart.current = new Chart(canvas.current, {
      type: "line",
      data: { labels: [], datasets: [{ data: [], fill: true, pointRadius: 0, tension: 0.2, borderWidth: 2 }] },
      options: {
        animation: false, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxTicksLimit: 8, color: "#8b95b0" }, grid: { display: false } }, y: { ticks: { color: "#8b95b0" }, grid: { color: "#27304a" } } }
      }
    });
    return () => chart.current.destroy();
  }, []);

  // chart data: refresh every 30s
  useEffect(() => {
    if (!ready || !sel) return;
    let alive = true;
    const load = async () => {
      try {
        const d = await getJSON(`/api/chart?symbol=${encodeURIComponent(sel)}&range=${range}`);
        if (!alive || !chart.current) return;
        const up = d.length < 2 || d.at(-1).c >= d[0].c, col = up ? "#22c55e" : "#ef4444";
        const ds = chart.current.data.datasets[0];
        chart.current.data.labels = d.map(p => {
          const t = new Date(p.t);
          return range === "1d" ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : t.toLocaleDateString([], { day: "numeric", month: "short", year: range === "1y" ? "2-digit" : undefined });
        });
        ds.data = d.map(p => p.c); ds.label = sel; ds.borderColor = col; ds.backgroundColor = col + "22";
        chart.current.update();
      } catch {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [sel, range, ready]);

  // month / year high-low
  useEffect(() => {
    if (!ready || !sel) return;
    let alive = true;
    const load = () => getJSON("/api/stats?symbol=" + encodeURIComponent(sel)).then(s => alive && setStats(o => ({ ...o, [sel]: s }))).catch(() => {});
    load();
    const id = setInterval(load, 300000);
    return () => { alive = false; clearInterval(id); };
  }, [sel, ready]);

  const addSymbol = () => {
    const s = newSym.trim().toUpperCase();
    if (!s || wl.includes(s)) return;
    setWl([...wl, s]); setSel(s); setNewSym("");
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
        <button onClick={enableNotif}>{notifLabel}</button>
      </header>
      <main>
        <aside className="card">
          <div className="row">
            <input value={newSym} onChange={e => setNewSym(e.target.value)} onKeyDown={e => e.key === "Enter" && addSymbol()} placeholder="Add symbol e.g. MSFT, TCS.NS" />
            <button className="p" onClick={addSymbol}>Add</button>
          </div>
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
            <div className="tabs">
              {[["1d", "Daily"], ["1mo", "Monthly"], ["1y", "Yearly"]].map(([r, l]) => (
                <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="box"><canvas ref={canvas} /></div>
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
      <div id="toasts">{toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}</div>
    </>
  );
}
