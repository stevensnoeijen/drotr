import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import App from './app';

describe('App', () => {
  it('renders the game title', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(<App />);
    });

    expect(container.textContent).toContain('Dracula: Reign of Terror');
  });

  it('links the home page to the unit preview page', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(<App />);
    });

    const link = [...container.querySelectorAll('a')].find(
      (a) => a.textContent === 'Unit preview'
    );
    expect(link?.getAttribute('href')).toBe('#/unit-preview');
  });
});
