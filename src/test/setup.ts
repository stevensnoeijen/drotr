class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Vitest doesn't set this by default, so React warns that state updates in
// tests aren't wrapped in act() even when they are (e.g. via Testing
// Library's render()).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};
