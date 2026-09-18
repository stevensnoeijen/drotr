class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom doesn't implement canvas rendering contexts, which logs a "Not
// implemented" error whenever Pixi probes for WebGL support. Stub it out
// since tests never rely on actual canvas drawing.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Vitest doesn't set this by default, so React warns that state updates in
// tests aren't wrapped in act() even when they are (e.g. via Testing
// Library's render()).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};
