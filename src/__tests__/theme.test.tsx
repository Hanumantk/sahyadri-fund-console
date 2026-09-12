/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemeToggle } from '../components/shell/ThemeToggle';

let systemDark = false;

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: systemDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  systemDark = false;
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  installMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('colour theme', () => {
  it('follows the system preference when no choice has been saved', () => {
    systemDark = true;
    render(<ThemeToggle />);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('switch', { name: 'Dark mode' }).getAttribute('aria-checked')).toBe('true');
  });

  it('lets a saved choice override the system preference', () => {
    systemDark = true;
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(<ThemeToggle />);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('switch', { name: 'Dark mode' }).getAttribute('aria-checked')).toBe('false');
  });

  it('switches immediately and persists the explicit choice', () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole('switch', { name: 'Dark mode' });

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('falls back safely when storage and media queries are unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });

    expect(() => render(<ThemeToggle />)).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
