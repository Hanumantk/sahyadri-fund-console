import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';

export type ColorTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sahyadri-color-theme';

function isTheme(value: string | null | undefined): value is ColorTheme {
  return value === 'light' || value === 'dark';
}

function savedTheme(): ColorTheme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): ColorTheme {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function resolveTheme(): ColorTheme {
  const active = document.documentElement.dataset.theme;
  if (isTheme(active)) return active;
  return savedTheme() ?? systemTheme();
}

export function applyTheme(theme: ColorTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.removeProperty('background-color');
  const canvas = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (canvas) {
    root.style.backgroundColor = canvas;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', canvas);
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ColorTheme>(resolveTheme);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    let media: MediaQueryList | undefined;
    try {
      media = window.matchMedia?.('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    if (!media) return;

    const followSystem = (event: MediaQueryListEvent) => {
      if (!savedTheme()) setTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', followSystem);
    return () => media?.removeEventListener?.('change', followSystem);
  }, []);

  const dark = theme === 'dark';
  const next: ColorTheme = dark ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-label="Dark mode"
      aria-checked={dark}
      title={`Switch to ${next} mode`}
      onClick={() => {
        applyTheme(next);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          /* The theme still changes for this visit when storage is unavailable. */
        }
        setTheme(next);
      }}
    >
      <span className="theme-toggle-thumb">
        <Icon name={dark ? 'moon' : 'sun'} />
      </span>
    </button>
  );
}
