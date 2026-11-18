import { Network } from './network.js';

const KEY = 'nocturne.nn.v1';

export function saveToFile(net, meta) {
  const json = net.serialize(meta);
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nocturne-weights-g${meta.games || 0}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFromFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    fr.onload = () => {
      try {
        const json = JSON.parse(fr.result);
        resolve({ net: Network.deserialize(json), meta: json.meta || null });
      } catch (e) { reject(e); }
    };
    fr.readAsText(file);
  });
}

export function autosave(net, meta) {
  try { localStorage.setItem(KEY, JSON.stringify(net.serialize(meta))); return true; }
  catch { return false; }
}

export function loadAuto() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const json = JSON.parse(raw);
    return { net: Network.deserialize(json), meta: json.meta || null };
  } catch { return null; }
}

export function clearAuto() { try { localStorage.removeItem(KEY); } catch {} }