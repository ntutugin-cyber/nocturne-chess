import { Position } from '../core/position.js';
import { legalMoves, materialOf } from '../core/movegen.js';
import { evaluate } from '../engine/evaluate.js';
import { Bot, MATE } from '../engine/bot.js';
import { detectOpening } from '../data/openings.js';
import {
  WHITE, BLACK, KING, QUEEN, BISHOP, KNIGHT, ROOK, VALUES,
  sqName, fileOf, rankOf, onBoard, KG_OFFS, RU, RU_GEN, RU_INST, colorName, colorNameGen,
} from '../core/constants.js';
import { icon, sleep } from './common.js';

const bot = new Bot(2);

// ─── Подробное описание матовой позиции ───
function describeMate(pos) {
  const loser = pos.turn, winner = -loser;
  const k = pos.kings[loser];
  const checkers = pos.attackers(k, winner);
  const parts = [];
  const checkerNames = checkers.map((s) => `${RU[Math.abs(pos.board[s])]} с ${sqName(s)}`);
  parts.push(`Король ${colorNameGen(loser)} на <b>${sqName(k)}</b> атакован ${checkerNames.join(' и ')}. Это шах, от которого нет ни одной защиты:`);
  const escapes = [];
  for (const o of KG_OFFS) {
    const t = k + o;
    if (!onBoard(t)) { escapes.push(`${'abcdefgh'[Math.max(0, Math.min(7, fileOf(k) + (o & 15) > 7 ? 0 : (o & 15))) }…} — край доски`); continue; }
    const q = pos.board[t];
    const name = sqName(t);
    if (q && Math.sign(q) === loser) escapes.push(`<b>${name}</b> занято своей фигурой (${RU[Math.abs(q)]})`);
    else if (q && Math.sign(q) === winner) {
      const defs = pos.attackers(t, winner).filter((d) => d !== t);
      escapes.push(defs.length
        ? `<b>${name}</b> — вражеская ${RU[Math.abs(q)]}, но она защищена (${defs.map((d) => RU[Math.abs(pos.board[d])] + ' с ' + sqName(d)).join(', ')})`
        : `<b>${name}</b> под ударом`);
    }
    else {
      const att = pos.attackers(t, winner);
      escapes.push(`<b>${name}</b> под ударом (${att.slice(0, 2).map((d) => RU[Math.abs(pos.board[d])] + ' с ' + sqName(d)).join(', ')})`);
    }
  }
  // корректная формулировка для края доски
  const clean = [];
  for (const o of KG_OFFS) {
    const t = k + o;
    if (!onBoard(t)) { clean.push('часть полей — за краем доски'); break; }
  }
  parts.push('Поля вокруг короля: ' + escapes.filter((e) => !e.includes('…')).join('; ') + (clean.length ? '; ' + clean[0] : '') + '.');
  if (checkers.length === 1) {
    const c = checkers[0];
    const defs = pos.attackers(c, winner);
    parts.push(defs.length
      ? `Атакующую фигуру нельзя взять: она защищена (${defs.map((d) => RU[Math.abs(pos.board[d])] + ' с ' + sqName(d)).join(', ')}).`
      : 'Атакующую фигуру нельзя взять ничем, кроме короля, а королю к ней не подойти.');
    const t = Math.abs(pos.board[c]);
    if ([QUEEN, ROOK, BISHOP].includes(t)) parts.push('Линию шаха также нельзя перекрыть — между атакующим и королём нет поля, куда могла бы встать фигура защиты.');
  } else {
    parts.push('Это двойной шах: закрыться или взять атакующего невозможно — можно только уходить королём, но все поля заняты или под ударом.');
  }
  // узор
  const kr = rankOf(k);
  const ownWall = KG_OFFS.filter((o) => onBoard(k + o) && pos.board[k + o] && Math.sign(pos.board[k + o]) === loser).length;
  if ((kr === 0 || kr === 7) && checkers.some((c) => [ROOK, QUEEN].includes(Math.abs(pos.board[c])) && rankOf(c) === kr))
    parts.push('<b>Узор:</b> классический линейный мат по последней горизонтали — собственные фигуры замуровали короля.');
  else if (checkers.some((c) => Math.abs(pos.board[c]) === KNIGHT) && ownWall >= 4)
    parts.push('<b>Узор:</b> «спёртый мат» — король задохнулся среди своих фигур, конь недосягаем.');
  parts.push(`Итог: <b>мат, победа ${colorNameGen(winner)}</b>. Партия окончена.`);
  return parts.map((p) => `<p>${p}</p>`).join('');
}

function describeEnd(game) {
  const r = game.result;
  if (r.reason === 'checkmate') return describeMate(game.pos);
  if (r.reason === 'stalemate') {
    const c = game.pos.turn;
    return `<p>Ход ${colorNameGen(c)}, король на <b>${sqName(game.pos.kings[c])}</b> <b>не под шахом</b>, но ни у одной фигуры нет легального хода: все поля короля под ударом, остальные фигуры заблокированы.</p><p>Это <b>пат — ничья</b>. Пропускать ход в шахматах нельзя, а любой ход привёл бы короля под удар. Атакующая сторона упустила победу: нужно было оставить сопернику хотя бы один безопасный ход.</p>`;
  }
  if (r.reason === 'fifty') return `<p>Последние <b>50 ходов</b> не было ни одного взятия и ни одного хода пешкой. По правилам это ничья: если никто не продвигает пешки и не меняет материал, прогресс невозможен.</p>`;
  if (r.reason === 'repetition') return `<p>Одна и та же позиция (с той же очередью хода и правами) возникла на доске <b>три раза</b>. Это ничья по правилу троекратного повторения — часто так спасаются в худшей позиции, гоняя короля или ферзя по кругу.</p>`;
  if (r.reason === 'material') return `<p>На доске осталось слишком мало фигур: мат физически невозможен (например, король против короля, или король с одним слоном/конём против короля). Это автоматическая <b>ничья — недостаточный материал</b>.</p>`;
  if (r.reason === 'resign') return `<p>${r.winner === WHITE ? 'Чёрные' : 'Белые'} <b>сдались</b>, признав позицию безнадёжной. Победа ${colorNameGen(r.winner)} без мата — так тоже заканчивается большинство серьёзных партий.</p>`;
  return '';
}

function classify(loss) {
  if (loss >= 300) return { key: 'blun', label: 'Зевок', sym: '??' };
  if (loss >= 120) return { key: 'mist', label: 'Ошибка', sym: '?' };
  if (loss >= 50) return { key: 'ine', label: 'Неточность', sym: '?!' };
  if (loss <= 15) return { key: 'exc', label: 'Отлично', sym: '!' };
  return { key: 'good', label: 'Хорошо', sym: '' };
}

export async function buildAnalysis(game, ctx, onProgress) {
  const h = game.history;
  const pos = new Position(game.startFen);
  const rows = [];
  const losses = { [WHITE]: [], [BLACK]: [] };
  const moments = [];
  let captures = 0, checks = 0, castles = 0, promos = 0;
  const sans = h.map((r) => r.san);
  const opening = detectOpening(sans);

  for (let i = 0; i < h.length; i++) {
    const rec = h[i];
    const mover = Math.sign(rec.move.piece);
    if (rec.move.captured) captures++;
    if (rec.move.promo) promos++;
    if (rec.san.startsWith('O-O')) castles++;
    if (rec.san.includes('+') || rec.san.includes('#')) checks++;

    let cls = { key: 'good', sym: '' }, loss = 0, evalCp = evaluate(pos);
    const legal = legalMoves(pos);
    if (legal.length > 1) {
      const res = await bot.search(pos, { depth: 2, budget: 130 });
      if (res) {
        const played = res.all.find((x) => x.move.from === rec.move.from && x.move.to === rec.move.to && x.move.promo === rec.move.promo);
        if (played) {
          if (res.score > MATE / 2 && played.score < MATE / 2) loss = 500;
          else if (played.score < -MATE / 2 && res.score > -MATE / 2) loss = 600;
          else loss = Math.max(0, res.score - played.score);
          cls = classify(loss);
        }
      }
    }
    losses[mover].push(loss);
    rows.push({ ply: i + 1, san: rec.san, mover, cls, loss, evalCp });
    if (loss >= 120) {
      moments.push({ ply: i + 1, san: rec.san, mover, loss, cls, num: Math.ceil((i + 1) / 2) });
    }
    pos.make(rec.move);
    onProgress?.(i + 1, h.length);
    await sleep(0);
  }

  const acc = {};
  for (const c of [WHITE, BLACK]) {
    const arr = losses[c];
    const mean = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    acc[c] = Math.round(100 * Math.exp(-mean / 260));
  }
  const counts = { [WHITE]: {}, [BLACK]: {} };
  rows.forEach((r) => { counts[r.mover][r.cls.key] = (counts[r.mover][r.cls.key] || 0) + 1; });

  const matW = materialOf(game.pos, WHITE), matB = materialOf(game.pos, BLACK);
  const topMoments = moments.sort((a, b) => b.loss - a.loss).slice(0, 4);

  // советы
  const tips = [];
  const pc = ctx.playerColor;
  if (pc) {
    const myBl = counts[pc].blun || 0;
    if (myBl >= 2) tips.push('Несколько зевков подряд — главный резерв роста. Перед ходом проверяй: не атакует ли соперник твою фигуру и что изменил его последний ход.');
    if ((counts[pc].mist || 0) + myBl === 0 && rows.length > 10) tips.push('Очень чистая игра без грубых ошибок — можно поднимать уровень соперника!');
    const castlePly = h.findIndex((r) => r.san.startsWith('O-O') && Math.sign(r.move.piece) === pc);
    if (h.length > 24 && castlePly === -1) tips.push('Король так и не рокировался. Старайся прятать его в первые 5–10 ходов — в центре он под перекрёстным огнём.');
    if (castlePly > 20) tips.push('Рокировка случилась поздно (после 10-го хода). Раньше прячь короля — дебют пойдёт спокойнее.');
  }
  if (!opening && h.length >= 8) tips.push('Дебют получился нестандартным. Держись формулы: центральная пешка → кони и слоны → рокировка.');
  if (game.result?.reason === 'stalemate') tips.push('Партия кончилась патом. В выигранных эндшпилях всегда проверяй: остаётся ли у соперника хоть один легальный ход?');
  if (captures < 6 && h.length > 40) tips.push('Мало взятий — позиция была закрытой. Учись вскрывать линии пешечными подрывами.');
  if (tips.length < 2) tips.push('После каждой партии смотри ключевые моменты ниже: понимание одной ошибки ценнее десяти выигранных партий на автомате.');

  return { rows, acc, counts, moments: topMoments, opening, captures, checks, castles, promos, matW, matB, tips, endHtml: describeEnd(game) };
}

export function renderAnalysis(a, game, ctx) {
  const r = game.result;
  const nameOf = (c) => ctx.names?.[c] || colorName(c);
  const winTitle = r.winner ? `Победа ${colorNameGen(r.winner)}!` : 'Ничья';
  let personal = winTitle;
  if (ctx.playerColor && r.winner) personal = r.winner === ctx.playerColor ? 'Вы победили! 🏆' : `Победил соперник (${nameOf(r.winner)})`;
  const reasonRu = { checkmate: 'мат', stalemate: 'пат', fifty: 'правило 50 ходов', repetition: 'троекратное повторение', material: 'недостаточный материал', resign: 'сдача' }[r.reason];

  const movesHtml = [];
  for (let i = 0; i < a.rows.length; i += 2) {
    const w = a.rows[i], b = a.rows[i + 1];
    const cell = (x) => x ? `<button class="move-cell" data-ply="${x.ply}">${x.san}<span class="badge ${x.cls.key}">${x.cls.sym}</span></button>` : '<span></span>';
    movesHtml.push(`<div class="move-row"><span class="move-num">${i / 2 + 1}.</span>${cell(w)}${cell(b)}</div>`);
  }

  const accRow = (c) => `<div class="acc-row"><span class="acc-name">${nameOf(c)}</span><div class="acc-bar"><i style="width:${a.acc[c]}%"></i></div><span class="acc-val">${a.acc[c]}%</span></div>`;
  const cnt = (c) => {
    const k = a.counts[c];
    return `${k.exc || 0} отличных · ${k.good || 0} хороших · ${k.ine || 0} неточностей · ${k.mist || 0} ошибок · ${k.blun || 0} зевков`;
  };

  return `
  <section><h3>${icon('flag')} Как закончилась партия</h3>${a.endHtml}
    <p>Результат: <b>${r.result}</b> (${reasonRu}), всего ходов: <b>${Math.ceil(game.history.length / 2)}</b>${ctx.duration ? `, время: <b>${ctx.duration}</b>` : ''}.</p></section>
  <section><h3>${icon('sparkle')} Ключевые моменты</h3>
    ${a.moments.length ? a.moments.map((m) => `<div class="moment ${m.cls.key === 'blun' ? 'blunder' : ''}">Ход ${m.num}: <b>${m.san}</b> (${nameOf(m.mover)}) — ${m.cls.label.toLowerCase()}, потеря ≈ ${(m.loss / 100).toFixed(1)} пешки. Кликни по ходу в записи ниже, чтобы увидеть позицию.</div>`).join('') : '<p>Грубых переломов не было — партия шла ровно. Так держать!</p>'}
  </section>
  <section><h3>${icon('target')} Точность игры</h3>${accRow(WHITE)}${accRow(BLACK)}
    <p style="font-size:12.5px;color:var(--ink-dim)">${nameOf(WHITE)}: ${cnt(WHITE)}.<br>${nameOf(BLACK)}: ${cnt(BLACK)}.</p></section>
  <section><h3>${icon('book')} Дебют и статистика</h3>
    <p>Дебют: <b>${a.opening || 'нестандартное начало'}</b>.</p>
    <div class="a-stats">
      <div class="a-stat"><small>Ходов</small><b>${Math.ceil(game.history.length / 2)}</b></div>
      <div class="a-stat"><small>Взятий</small><b>${a.captures}</b></div>
      <div class="a-stat"><small>Шахов</small><b>${a.checks}</b></div>
      <div class="a-stat"><small>Рокировок</small><b>${a.castles}</b></div>
      <div class="a-stat"><small>Превращений</small><b>${a.promos}</b></div>
      <div class="a-stat"><small>Материал Б/Ч</small><b>${(a.matW / 100).toFixed(0)}/${(a.matB / 100).toFixed(0)}</b></div>
    </div></section>
  <section><h3>${icon('bulb')} Советы на будущее</h3><ul>${a.tips.map((t) => `<li>${t}</li>`).join('')}</ul></section>
  <section><h3>${icon('copy')} Полная запись (клик = просмотр)</h3><div class="a-moves">${movesHtml.join('')}</div></section>`;
}

export function analysisHeader(game, ctx) {
  const r = game.result;
  let title, sub, cls = '';
  if (!r.winner) { title = 'Ничья'; cls = 'draw'; }
  else if (ctx.playerColor) {
    if (r.winner === ctx.playerColor) { title = 'Вы победили!'; }
    else { title = 'Поражение'; cls = 'lose'; }
  } else title = `Победа ${colorNameGen(r.winner)}`;
  const reasonRu = { checkmate: 'Мат королю', stalemate: 'Пат — нет ходов без шаха', fifty: 'Правило 50 ходов', repetition: 'Троекратное повторение позиции', material: 'Недостаточно материала для мата', resign: 'Сдача стороны' }[r.reason];
  sub = `${reasonRu} · ${r.result} · ${Math.ceil(game.history.length / 2)} ходов`;
  return { title, sub, cls, iconHtml: r.winner ? icon('trophy') : icon('handshake') };
}