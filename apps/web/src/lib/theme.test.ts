import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** `prefers-color-scheme` simulado: jsdom no implementa `matchMedia`. */
function mockSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return {
    change(next: boolean) {
      dark = next;
      listeners.forEach((fn) => {
        fn();
      });
    },
  };
}

// El módulo guarda estado (suscriptores): se carga de nuevo en cada prueba.
const load = async () => {
  vi.resetModules();
  return import('./theme');
};
const html = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html().classList.remove('dark');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('theme (F08)', () => {
  it('CA-1 sin elección guardada sigue al sistema y cambia en vivo', async () => {
    const system = mockSystem(true);
    const theme = await load();
    theme.initTheme();
    expect(theme.getThemeChoice()).toBe('system');
    expect(html().classList.contains('dark')).toBe(true);
    expect(html().style.colorScheme).toBe('dark');

    system.change(false);
    expect(html().classList.contains('dark')).toBe(false);
    expect(html().style.colorScheme).toBe('light');
  });

  it('CA-2 y CA-3 la elección se aplica al instante y se recuerda', async () => {
    const system = mockSystem(false);
    let theme = await load();
    theme.initTheme();
    theme.setThemeChoice('dark');
    expect(html().classList.contains('dark')).toBe(true);

    // "Recargar": el módulo se carga de nuevo y lee la elección guardada.
    html().classList.remove('dark');
    theme = await load();
    theme.initTheme();
    expect(theme.getThemeChoice()).toBe('dark');
    expect(html().classList.contains('dark')).toBe(true);

    // Una elección fija no sigue al sistema.
    system.change(false);
    expect(html().classList.contains('dark')).toBe(true);

    theme.setThemeChoice('system');
    expect(localStorage.getItem('anderp-theme')).toBeNull();
    expect(html().classList.contains('dark')).toBe(false);
  });

  it('avisa a los suscriptores cuando cambia la elección', async () => {
    mockSystem(false);
    const theme = await load();
    const listener = vi.fn();
    const unsubscribe = theme.subscribeTheme(listener);
    theme.setThemeChoice('light');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    theme.setThemeChoice('dark');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('CA-3 si el almacenamiento falla, usa el sistema y no se rompe', async () => {
    mockSystem(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const theme = await load();
    theme.initTheme();
    expect(theme.getThemeChoice()).toBe('system');
    expect(() => {
      theme.setThemeChoice('light');
    }).not.toThrow();
    expect(html().classList.contains('dark')).toBe(false);
  });
});
