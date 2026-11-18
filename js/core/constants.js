// ═══ Базовые константы шахмат (доска 0x88) ═══
export const WHITE = 1, BLACK = -1;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

export const F = { DOUBLE: 1, EP: 2, CASTLE_K: 4, CASTLE_Q: 8 };
export const C = { WK: 1, WQ: 2, BK: 4, BQ: 8 };
export const CORNER = { 0x00: C.WQ, 0x07: C.WK, 0x70: C.BQ, 0x77: C.BK };

export const KN_OFFS = [33, 31, 18, 14, -33, -31, -18, -14];
export const KG_OFFS = [16, -16, 1, -1, 17, 15, -17, -15];
export const B_OFFS = [17, 15, -17, -15];
export const R_OFFS = [16, -16, 1, -1];

export const FILES = 'abcdefgh';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const onBoard = (i) => (i & 0x88) === 0;
export const fileOf = (i) => i & 15;
export const rankOf = (i) => i >> 4;
export const sq = (f, r) => r * 16 + f;
export const sqName = (i) => FILES[i & 15] + ((i >> 4) + 1);
export const fromSq = (s) => sq(FILES.indexOf(s[0]), +s[1] - 1);
export const isLight = (i) => ((i & 15) + (i >> 4)) % 2 === 1;

export const LETTERS = { [KNIGHT]: 'N', [BISHOP]: 'B', [ROOK]: 'R', [QUEEN]: 'Q', [KING]: 'K' };
export const VALUES = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 0 };

export const RU = {
  [PAWN]: 'пешка', [KNIGHT]: 'конь', [BISHOP]: 'слон', [ROOK]: 'ладья', [QUEEN]: 'ферзь', [KING]: 'король',
};
export const RU_GEN = {
  [PAWN]: 'пешки', [KNIGHT]: 'коня', [BISHOP]: 'слона', [ROOK]: 'ладьи', [QUEEN]: 'ферзя', [KING]: 'короля',
};
export const RU_INST = {
  [PAWN]: 'пешкой', [KNIGHT]: 'конём', [BISHOP]: 'слоном', [ROOK]: 'ладьёй', [QUEEN]: 'ферзём', [KING]: 'королём',
};
export const colorName = (c) => (c === WHITE ? 'белые' : 'чёрные');
export const colorNameGen = (c) => (c === WHITE ? 'белых' : 'чёрных');