import { WHITE } from '../core/constants.js';
import { C } from '../core/constants.js';

// 12 слоёв × 64 + очередь хода + 4 рокировки = 773 входа
export const INPUT_SIZE = 773;

export function encode(pos) {
  const x = new Float32Array(INPUT_SIZE);
  const active = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = pos.board[s];
    if (!p) continue;
    const plane = (p > 0 ? 0 : 6) + Math.abs(p) - 1;
    const idx = plane * 64 + (7 - (s >> 4)) * 8 + (s & 15);
    x[idx] = 1; active.push(idx);
  }
  x[768] = pos.turn === WHITE ? 1 : -1; active.push(768);
  const bits = [C.WK, C.WQ, C.BK, C.BQ];
  for (let i = 0; i < 4; i++) if (pos.castling & bits[i]) { x[769 + i] = 1; active.push(769 + i); }
  return { x, active };
}