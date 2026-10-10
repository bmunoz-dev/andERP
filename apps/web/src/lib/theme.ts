import { useSyncExternalStore } from 'react';

/** Tema de la interfaz (F08). "Sistema" sigue a `prefers-color-scheme` y no se guarda. */
export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'anderp-theme';
const listeners = new Set<() => void>();

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** La preferencia vive en el navegador; si el almacenamiento está bloqueado, vale "Sistema". */
export function getThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Almacenamiento no disponible (modo privado, bloqueo del navegador).
  }
  return 'system';
}

function apply(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && systemQuery().matches);
  document.documentElement.classList.toggle('dark', dark);
  // También cambian los controles nativos: calendario de <input type="date">, scroll, etc.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Sin almacenamiento la elección dura hasta recargar.
  }
  apply(choice);
  listeners.forEach((listener) => {
    listener();
  });
}

/** Se llama en `main.tsx` antes de pintar: sin parpadeo y sin scripts en línea (CSP). */
export function initTheme(): void {
  apply(getThemeChoice());
  systemQuery().addEventListener('change', () => {
    if (getThemeChoice() === 'system') apply('system');
  });
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeTheme, getThemeChoice);
}
