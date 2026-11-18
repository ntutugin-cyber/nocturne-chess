// ═══ DOM-утилиты, вкладки, модалки, тосты, иконки ═══
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ICONS = {
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  knight: '<path d="M7 20c.4-3.5 1.5-5.5 3.2-7.2-1.2 0-2.5.3-3.5-.4-1-.8-1-2.2 0-3.2l3-3c1-2 2.7-3.3 4.5-3.6L15 1l1.7 2.4c2.3.7 3.8 3 3.8 5.6 0 3-1.4 5.4-2.2 7.8-.6 1.7-.3 3.2.4 4.2z"/><path d="M5 20h14"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  flip: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/>',
  undo: '<path d="M8 5L3 10l5 5"/><path d="M3 10h11a6 6 0 0 1 0 12h-3"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h13l-2.5 4L18 12H5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  upload: '<path d="M12 15V3m0 0L8 7m4-4l4 4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/>',
  handshake: '<path d="M3 11l4-4h5l3 3-4 4-2-2"/><path d="M21 11l-4-4h-3"/><path d="M7 7L3 11l5 5 2-2 3 3 2-2 2 2 4-4"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
export function injectIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); el.removeAttribute('data-icon'); });
}

// ─── Вкладки ───
export function initTabs(onChange) {
  const tabs = $$('.tab');
  const show = (name) => {
    tabs.forEach((t) => t.classList.toggle('on', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    onChange?.(name);
  };
  tabs.forEach((t) => t.addEventListener('click', () => { location.hash = t.dataset.view; }));
  window.addEventListener('hashchange', () => show(parseHash()));
  const parseHash = () => {
    const h = location.hash.replace('#', '');
    return ['learn', 'play', 'neural'].includes(h) ? h : 'learn';
  };
  show(parseHash());
  return { show, current: parseHash };
}

// ─── Модалки ───
export function openModal(id) {
  const m = typeof id === 'string' ? $('#' + id) : id;
  m.hidden = false;
  const focusable = m.querySelector('button:not([data-close]), input, select');
  setTimeout(() => focusable?.focus(), 60);
}
export function closeModal(id) {
  const m = typeof id === 'string' ? $('#' + id) : id;
  m.hidden = true;
}
export function initModals() {
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal').forEach((m) => { if (!m.hidden) closeModal(m); });
  });
}
export function confirmDialog(text, title = 'Подтвердите действие') {
  return new Promise((resolve) => {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    openModal('modal-confirm');
    const yes = $('#btnConfirmYes'), no = $('#btnConfirmNo');
    const done = (v) => {
      closeModal('modal-confirm');
      yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo);
      resolve(v);
    };
    const onYes = () => done(true), onNo = () => done(false);
    yes.addEventListener('click', onYes); no.addEventListener('click', onNo);
  });
}

// ─── Тосты ───
export function toast(msg, type = 'info', ms = 3200) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

// ─── Переключатели ───
export function bindSwitch(el, initial, onChange) {
  let state = initial;
  const render = () => { el.classList.toggle('on', state); el.setAttribute('aria-checked', String(state)); };
  render();
  el.addEventListener('click', (e) => { e.preventDefault(); state = !state; render(); onChange?.(state); });
  return { get: () => state, set: (v) => { state = v; render(); } };
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); ta.remove();
  return Promise.resolve();
}

export function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}