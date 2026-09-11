/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { RULEBOOK_SETUP_STORAGE_KEY } from '../data/rulebook';
import { RulebookProvider, useRulebook } from '../state/rulebook';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('first-visit fund setup gate', () => {
  it('redirects a new visitor from any operating route into setup', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/audit']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Fund setup' })).toBeTruthy();
    expect(container.querySelector('.topbar')).toBeNull();
    expect(container.querySelector('.sidebar')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Fund setup steps' })).toBeTruthy();
    expect(container.querySelector('.setup-stage > .setup-actions')).toBeNull();
    expect(container.querySelector('.setup-stage-shell > .setup-actions')).toBeTruthy();
  });

  it('keeps setup out of the returning-visitor journey', async () => {
    window.localStorage.setItem(RULEBOOK_SETUP_STORAGE_KEY, 'complete');
    render(<MemoryRouter initialEntries={['/setup']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /Rulebook/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Fund setup' })).toBeNull();
  });

  it('records completion when the fund launches', () => {
    function LaunchProbe() {
      const { launch } = useRulebook();
      return <button onClick={launch}>Launch</button>;
    }
    render(<RulebookProvider><LaunchProbe /></RulebookProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(window.localStorage.getItem(RULEBOOK_SETUP_STORAGE_KEY)).toBe('complete');
  });
});
