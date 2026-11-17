// Real-time prices from Yahoo's public WebSocket (runs in the browser, no server needed).
// Messages are JSON { type: "pricing", message: <base64 protobuf> } - decoded here by hand.
export function decodeTick(b64) {
  try {
    const b = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dv = new DataView(b.buffer);
    let i = 0; const t = {};
    const varint = () => { let r = 0, m = 1, x; do { x = b[i++]; r += (x & 127) * m; m *= 128; } while (x & 128); return r; };
    const zz = n => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);
    while (i < b.length) {
      const tag = varint(), f = Math.floor(tag / 8), w = tag % 8;
      if (w === 0) { const v = varint(); if (f === 3) t.time = zz(v); else if (f === 9) t.volume = zz(v); }
      else if (w === 5) {
        const v = dv.getFloat32(i, true); i += 4;
        if (f === 2) t.price = v; else if (f === 10) t.dayHigh = v; else if (f === 11) t.dayLow = v;
      } else if (w === 2) { const n = varint(); if (f === 1) t.symbol = new TextDecoder().decode(b.subarray(i, i + n)); i += n; }
      else if (w === 1) i += 8;
      else return null;
    }
    if (!t.symbol || !(t.price > 0)) return null;
    const r = v => +v.toPrecision(7);                    // float32 only holds ~7 digits
    t.price = r(t.price);
    if (t.dayHigh) t.dayHigh = r(t.dayHigh);
    if (t.dayLow) t.dayLow = r(t.dayLow);
    t.time = t.time ? (t.time > 1e11 ? Math.floor(t.time / 1000) : t.time) : Math.floor(Date.now() / 1000);
    return t;
  } catch { return null; }
}

export function connectStream({ symbols, onTick, onStatus, WS = globalThis.WebSocket }) {
  let ws, stop = false, retry = 0, timer, beat;
  const sub = () => ws?.readyState === 1 && ws.send(JSON.stringify({ subscribe: symbols }));
  const schedule = () => { retry++; timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retry)); };
  function open() {
    onStatus?.('connecting');
    try { ws = new WS('wss://streamer.finance.yahoo.com/?version=2'); } catch { onStatus?.('offline'); schedule(); return; }
    ws.onopen = () => { retry = 0; onStatus?.('connected'); sub(); beat = setInterval(sub, 30000); };
    ws.onmessage = e => {
      try { const m = JSON.parse(e.data); if (m.type === 'pricing') { const t = decodeTick(m.message); if (t) onTick(t); } } catch {}
    };
    ws.onclose = () => { clearInterval(beat); if (!stop) { onStatus?.('offline'); schedule(); } };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  open();
  return { close() { stop = true; clearTimeout(timer); clearInterval(beat); try { ws?.close(); } catch {} } };
}
