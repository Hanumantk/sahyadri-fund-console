/**
 * @vitest-environment jsdom
 *
 * The design is frozen.
 *
 * This renders Home and the Audit trail in each state and reduces the result to
 * its shape: tag names and class names, no text. The fixtures under
 * src/__tests__/__fixtures__ were taken from the app before the numbers work
 * started. A number may change; an element, a class or a nesting may not.
 *
 * If this fails, the change is wrong, not the fixture. The one exception is a
 * design change asked for in so many words, and then the fixture is retaken in
 * its own commit.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StoreProvider } from '../state/store';
import { Home } from '../pages/Home';
import { AuditTrail } from '../pages/AuditTrail';
import { STATES, type StateName } from '../data/scenario';

const DIR = 'src/__tests__/__fixtures__';

/** Tag and class only. Text, values and attributes are all dropped. */
function skeleton(el: Element, depth = 0): string {
  const cls = typeof el.className === 'string' ? el.className.trim() : '';
  const line = `${'  '.repeat(depth)}${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/).filter(Boolean).join('.') : ''}`;
  return [line, ...[...el.children].map((c) => skeleton(c, depth + 1))].join('\n');
}

function shapeOf(state: StateName, page: 'home' | 'audit'): string {
  const { container } = render(
    <MemoryRouter>
      <StoreProvider state={state}>{page === 'home' ? <Home /> : <AuditTrail />}</StoreProvider>
    </MemoryRouter>,
  );
  const out = [...container.children].map((c) => skeleton(c)).join('\n');
  cleanup();
  return out;
}

describe('design freeze', () => {
  beforeAll(() => {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  });

  for (const state of STATES) {
    for (const page of ['home', 'audit'] as const) {
      it(`${page} in ${state} has the shape it had before`, () => {
        const shape = shapeOf(state, page);
        const file = join(DIR, `${page}-${state}.shape.txt`);
        if (!existsSync(file)) {
          // First run writes the fixture. A later run compares against it.
          writeFileSync(file, shape, 'utf8');
          return;
        }
        expect(shape).toBe(readFileSync(file, 'utf8'));
      });
    }
  }

  it('a decision panel keeps its shape', () => {
    const { container } = render(
      <MemoryRouter>
        <StoreProvider state="normal">
          <Home />
        </StoreProvider>
      </MemoryRouter>,
    );
    // Every part the wireframe put on Home is still there, once.
    for (const sel of ['.layer1', '.agent-row', '.queue', '.panel', '.chat', '.block', '.dcard', '.agent-card']) {
      expect(container.querySelectorAll(sel).length, sel).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll('.block').length).toBe(4);
    expect(container.querySelectorAll('.agent-card').length).toBe(6);
    cleanup();
  });
});
