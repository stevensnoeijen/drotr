import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders the game title', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(<App />);
    });

    expect(container.textContent).toContain('Dracula: Reign of Terror');
  });
});
