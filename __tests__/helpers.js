// Test-only protobuf encoder that mirrors Yahoo's PricingData message (fields 1,2,3,9,10,...)
const varint = n => { const o = []; while (n >= 128) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const zz = n => (n >= 0 ? n * 2 : -n * 2 - 1);
const f32 = x => [...new Uint8Array(new Float32Array([x]).buffer)];
export function encodeTick(t) {
  const o = [], str = (f, s) => { const b = [...new TextEncoder().encode(s)]; o.push(f * 8 + 2, ...varint(b.length), ...b); };
  const flt = (f, x) => o.push(f * 8 + 5, ...f32(x)), sint = (f, n) => o.push(f * 8, ...varint(zz(n)));
  str(1, t.id); flt(2, t.price);
  if (t.time != null) sint(3, t.time);
  if (t.name) str(13, t.name);                       // fields we do not use must be skipped safely
  if (t.volume != null) sint(9, t.volume);
  if (t.dayHigh) flt(10, t.dayHigh);
  if (t.open) flt(15, t.open);
  return btoa(String.fromCharCode(...o));
}
export class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(m) { this.sent.push(m); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(o) { this.onmessage?.({ data: typeof o === 'string' ? o : JSON.stringify(o) }); }
}
