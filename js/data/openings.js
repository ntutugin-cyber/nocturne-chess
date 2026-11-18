// Книга дебютов: префиксы SAN (без +/#)
const BOOK = [
  ['e4 e5 Nf3 Nc6 Bb5', 'Испанская партия'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'Итальянская партия'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'Защита двух коней'],
  ['e4 e5 Nf3 Nc6 Nc3 Nf6', 'Дебют четырёх коней'],
  ['e4 e5 Nf3 Nc6 d4', 'Шотландская партия'],
  ['e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7', 'Детский мат'],
  ['e4 e5 Nf3 Nc6', 'Открытый дебют'],
  ['e4 e5', 'Открытая игра'],
  ['e4 c5', 'Сицилианская защита'],
  ['e4 e6', 'Французская защита'],
  ['e4 c6', 'Защита Каро-Канн'],
  ['e4 d5', 'Скандинавская защита'],
  ['e4 d6', 'Защита Пирца'],
  ['e4 Nf6', 'Защита Алехина'],
  ['d4 d5 c4 e6', 'Ферзевый гамбит'],
  ['d4 d5 c4 c6', 'Славянская защита'],
  ['d4 d5 c4', 'Ферзевый гамбит'],
  ['d4 Nf6 c4 g6', 'Индийская защита'],
  ['d4 d5', 'Закрытая игра'],
  ['d4 f5', 'Голландская защита'],
  ['c4', 'Английское начало'],
  ['Nf3', 'Дебют Рети'],
  ['e4', 'Королевская пешка'],
  ['d4', 'Ферзевая пешка'],
];

export function detectOpening(sans) {
  const line = sans.map((s) => s.replace(/[+#]/g, '')).join(' ');
  let best = null;
  for (const [prefix, name] of BOOK) {
    if (line.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = [prefix, name];
  }
  return best ? best[1] : null;
}
export const BOOK_PREFIXES = BOOK.map(([p]) => p.split(' '));