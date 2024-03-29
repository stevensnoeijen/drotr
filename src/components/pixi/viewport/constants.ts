export const EVENTS = [
  'clicked',
  'drag-start',
  'drag-end',
  'drag-remove',
  'pinch-start',
  'pinch-end',
  'pinch-remove',
  'snap-start',
  'snap-end',
  'snap-remove',
  'snap-zoom-start',
  'snap-zoom-end',
  'snap-zoom-remove',
  'bounce-x-start',
  'bounce-x-end',
  'bounce-y-start',
  'bounce-y-end',
  'bounce-remove',
  'wheel',
  'wheel-remove',
  'wheel-scroll',
  'wheel-scroll-remove',
  'mouse-edge-start',
  'mouse-edge-end',
  'mouse-edge-remove',
  'moved',
  'moved-end',
  'zoomed',
  'zoomed-end',
  'frame-end',
] as const;

export type Event = typeof EVENTS[number];
