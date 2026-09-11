// Small inline icon set, stroke-based, so colour never works alone.
import type React from 'react';

type Name =
  | 'home'
  | 'portfolio'
  | 'rules'
  | 'audit'
  | 'settings'
  | 'search'
  | 'scale'
  | 'shield'
  | 'book'
  | 'bolt'
  | 'ledger'
  | 'eye'
  | 'clock'
  | 'alert'
  | 'pause'
  | 'play'
  | 'check'
  | 'x'
  | 'send'
  | 'link'
  | 'chevron-down'
  | 'chevron-up'
  | 'arrow-down-right'
  | 'arrow-up-right'
  | 'minus'
  | 'split'
  | 'wait'
  | 'mic'
  | 'warning'
  | 'chevron-left'
  | 'chevron-right'
  | 'bulb'
  | 'sidebar';

const PATHS: Record<Name, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  portfolio: 'M3 3v18h18M7 14l4-4 3 3 6-6',
  rules: 'M4 6h16M4 12h10M4 18h6M17 15l2 2 4-4',
  audit: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  scale: 'M12 3v18M5 7l7-2 7 2M3 14l2-7 2 7a2 2 0 0 1-4 0zM17 14l2-7 2 7a2 2 0 0 1-4 0zM8 21h8',
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a1 1 0 0 0-1-1H4zM20 4h-6a2 2 0 0 0-2 2v14a1 1 0 0 1 1-1h7z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  ledger: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v1',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l12 8-12 8z',
  check: 'M5 12l4 4L19 6',
  x: 'M6 6l12 12M18 6L6 18',
  send: 'M12 19V5M5 12l7-7 7 7',
  link: 'M14 4h6v6M20 4l-9 9M10 6H5v13h13v-5',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'arrow-down-right': 'M7 7l10 10M17 8v9H8',
  'arrow-up-right': 'M7 17L17 7M8 7h9v9',
  minus: 'M5 12h14',
  split: 'M12 4v7M12 11l-5 5M12 11l5 5M7 16v4M17 16v4',
  wait: 'M6 3h12M6 21h12M8 3c0 5 4 5 4 9s-4 4-4 9M16 3c0 5-4 5-4 9s4 4 4 9',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  warning: 'M6 1L11.5 9.5H0.5zM6 4.3v2.4M6 7.7v0.6',
  'chevron-left': 'M15 4l-7 8 7 8',
  'chevron-right': 'M9 4l7 8-7 8',
  sidebar: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9.5 5v14',
  bulb: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.8 10.7c.7.6 1.1 1.4 1.2 2.3h5.2c.1-.9.5-1.7 1.2-2.3A6 6 0 0 0 12 3z',
};

// A few glyphs are drawn on their own box so they keep their aspect ratio.
const BOXES: Partial<Record<Name, string>> = { warning: '0 0 12 10' };
const STROKES: Partial<Record<Name, number>> = { warning: 1 };

export function Icon({ name, className, style }: { name: Name; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox={BOXES[name] ?? '0 0 24 24'}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKES[name] ?? 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type IconName = Name;
