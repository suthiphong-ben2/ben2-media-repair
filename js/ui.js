// DOM helpers shared by the teacher and admin apps. Never builds HTML from data strings.
const LOGO = 'https://www.ben2.ac.th/wordpress/wp-content/uploads/2026/07/cropped-cropped-Gemini_Generated_Image_sceysnsceysnscey-Photoroom-2-150x150.png';

/** el('div', {class:'x', onclick: fn}, 'text', childNode, ...) — text goes in as text nodes. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const icon = (name, extra = '') => el('i', { class: `fas ${name} ${extra}`.trim(), 'aria-hidden': 'true' });

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function toast(message, kind = '') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const t = el('div', { class: `toast ${kind}`.trim(), role: kind === 'error' ? 'alert' : 'status' }, message);
  host.append(t);
  setTimeout(() => t.remove(), 3500);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

/** Brand bar: crest (falls back to an icon if the school's image is unavailable) + title. */
export function brand(title, subtitle) {
  const fallback = el('span', { class: 'brand-fallback' }, icon('fa-school'));
  const img = el('img', { src: LOGO, alt: '', width: 40, height: 40 });
  img.addEventListener('error', () => { img.style.display = 'none'; fallback.style.display = 'flex'; });
  return el('a', { class: 'brand', href: 'index.html' },
    img, fallback,
    el('span', { class: 'brand-text' }, el('strong', {}, title), el('span', {}, subtitle)));
}

/** Resize a photo to <=1280px JPEG so uploads stay small on school Wi-Fi/mobile data. */
export function resizeImage(file, maxSide = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read-image')); };
    img.src = url;
  });
}

export function statusBadge(meta) {
  return el('span', { class: `badge badge-${meta.key}` }, icon(meta.icon), meta.label);
}
