// Мини-шина событий
export class Emitter {
  constructor() { this._h = new Map(); }
  on(evt, fn) {
    if (!this._h.has(evt)) this._h.set(evt, new Set());
    this._h.get(evt).add(fn);
    return () => this._h.get(evt)?.delete(fn);
  }
  emit(evt, data) { this._h.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }
}