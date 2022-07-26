import * as PIXI from 'pixi.js';

import { defineMockGetSetProperty } from './../../../__tests__/utils';

const realPIXI = jest.requireActual('pixi.js');

export type MockedTicker = PIXI.Ticker & { __name: string };

export const Ticker = jest.fn().mockImplementation(() => {
  const callbacks: PIXI.TickerCallback<unknown>[] = [];

  const ticker = {
    __name: 'mocked-pixi-ticker',
    add: jest.fn((callback: PIXI.TickerCallback<unknown>) =>
      callbacks.push(callback)
    ),
    addOnce: jest.fn((callback: PIXI.TickerCallback<unknown>) =>
      callbacks.push(callback)
    ),
    emit: (delta: number) => {
      callbacks.forEach((callback) => callback(delta));
    },
  };

  // set default properties
  defineMockGetSetProperty(ticker, 'autoStart', false);
  defineMockGetSetProperty(ticker, 'maxFPS', 0);
  defineMockGetSetProperty(ticker, 'minFPS', 10);
  defineMockGetSetProperty(ticker, 'speed', 1);
  defineMockGetSetProperty(ticker, 'priority', realPIXI.UPDATE_PRIORITY.NORMAL);

  return ticker;
});

export type MockedLoader = PIXI.Loader & { __name: string };

export const Loader = jest.fn().mockImplementation(() => {
  const loader = {
    __name: 'mocked-pixi-loader',
  };

  // set default properties
  defineMockGetSetProperty(loader, 'baseUrl', '');
  defineMockGetSetProperty(loader, 'concurrency', 10);
  defineMockGetSetProperty(loader, 'defaultQueryString', '');

  return loader;
});

export type MockedApplication = PIXI.Application & { __name: string };

export const Application = jest.fn().mockImplementation(() => {
  return {
    __name: 'mocked-pixi-application',
    ticker: new Ticker(),
    loader: new Loader(),
    view: document.createElement('canvas'),
  };
});

export const settings = {
  RESOLUTION: realPIXI.RESOLUTION,
};

export const UPDATE_PRIORITY = realPIXI.UPDATE_PRIORITY;
