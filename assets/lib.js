import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

export const STORAGE_KEY = 'gazdalkodj-okosan-session';

export function createSupabase() {
  if (DEMO_MODE) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.style.borderColor = type === 'error'
    ? 'rgba(251, 113, 133, 0.35)'
    : type === 'success'
      ? 'rgba(52, 211, 153, 0.35)'
      : 'rgba(94, 234, 212, 0.35)';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

export function randomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function currency(value) {
  return new Intl.NumberFormat('hu-HU').format(Number(value || 0));
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cloneInventory(value) {
  if (Array.isArray(value)) return [...value];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function getTileColor(type) {
  switch (type) {
    case 'start': return 'var(--accent)';
    case 'money': return 'var(--success)';
    case 'card': return 'var(--accent-2)';
    case 'shop': return 'var(--warning)';
    case 'skip': return 'var(--danger)';
    case 'move': return '#a78bfa';
    default: return 'rgba(255,255,255,0.18)';
  }
}
