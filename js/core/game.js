import { Emitter } from './events.js';
import { Position } from './position.js';
import { legalMoves, san, gameStatus } from './movegen.js';
import { WHITE, START_FEN } from './constants.js';

export class Game extends Emitter {
  constructor(fen = START_FEN) { super(); this.reset(fen); }

  reset(fen = START_FEN) {
    this.pos = new Position(fen);
    this.startFen = this.pos.fen();
    this.history = [];
    this.keys = [this.pos.key()];
    this.result = null;
    this.emit('reset');
  }

  get turn() { return this.pos.turn; }
  moves(from = -1) { return this.result ? [] : legalMoves(this.pos, from); }

  play(m) {
    if (this.result) return null;
    const notation = san(this.pos, m);
    const fenBefore = this.pos.fen();
    const undo = this.pos.make(m);
    const rec = { move: m, san: notation, undo, fenBefore, fenAfter: this.pos.fen(), ply: this.history.length + 1 };
    this.history.push(rec);
    const key = this.pos.key();
    this.keys.push(key);
    let rep = 0; for (const k of this.keys) if (k === key) rep++;
    this.result = gameStatus(this.pos, rep);
    if (!this.result.over) this.result = null;
    this.emit('move', rec);
    if (this.result) this.emit('end', this.result);
    return rec;
  }

  undo() {
    const rec = this.history.pop();
    if (!rec) return null;
    this.pos.unmake(rec.move, rec.undo);
    this.keys.pop();
    this.result = null;
    this.emit('undo', rec);
    return rec;
  }

  resign(color) {
    if (this.result) return;
    this.result = { over: true, reason: 'resign', winner: -color, result: color === WHITE ? '0-1' : '1-0' };
    this.emit('end', this.result);
  }

  pgn(meta = {}) {
    const h = this.history;
    const res = this.result ? this.result.result : '*';
    const date = new Date();
    const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    const headers = [
      ['Event', meta.event || 'Ноктюрн — товарищеская партия'],
      ['Site', 'Nocturne Chess'], ['Date', d],
      ['White', meta.white || 'Белые'], ['Black', meta.black || 'Чёрные'], ['Result', res],
    ];
    if (this.startFen !== START_FEN) headers.push(['FEN', this.startFen], ['SetUp', '1']);
    let body = '';
    for (let i = 0; i < h.length; i++) {
      if (i % 2 === 0) body += `${i / 2 + 1}. `;
      body += h[i].san + ' ';
    }
    return headers.map(([k, v]) => `[${k} "${v}"]`).join('\n') + '\n\n' + body + res;
  }
}