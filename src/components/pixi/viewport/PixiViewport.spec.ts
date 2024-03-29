import { mount } from '@vue/test-utils';
import { Viewport } from 'pixi-viewport';
import * as PIXI from 'pixi.js';

import { MockedTicker } from '../../../__mocks__/pixi.js.js';
import { disableConsoleWarn } from '../../../__tests__/utils';
import PixiApplication from '../app/PixiApplication.vue';

import PixiViewport from './PixiViewport.vue';
import { EVENTS } from './constants';

it('should expose viewport', () => {
  const wrapper = mount(PixiApplication, {
    slots: {
      default: [PixiViewport],
    },
  });
  const component = wrapper.getComponent(PixiViewport);
  const viewport = component.vm.viewport;

  expect(viewport).toBeInstanceOf(Viewport);
});

it('should error when not placed inside a pixi-application', () => {
  const spy = disableConsoleWarn();
  expect(() => {
    mount(PixiViewport);
  }).toThrowError('pixi-viewport must be used inside pixi-application');
  spy.mockRestore();
});

it("should add viewport to application's stage", () => {
  const wrapper = mount(PixiApplication, {
    slots: {
      default: [PixiViewport],
    },
  });
  const viewportComponent = wrapper.getComponent(PixiViewport);
  const appComponent = wrapper.getComponent(PixiApplication);
  const application = appComponent.vm.application;

  expect(application.stage.addChild).toHaveBeenCalledWith(
    viewportComponent.vm.viewport
  );
});

it('should have default properties', () => {
  const wrapper = mount(PixiApplication, {
    slots: {
      default: [PixiViewport],
    },
  });
  const component = wrapper.findComponent(PixiViewport);
  const viewport = component.vm.viewport;

  expect(viewport.screenWidth).toBe(window.innerWidth);
  expect(viewport.screenHeight).toBe(window.innerHeight);
  expect(viewport.worldWidth).toBe(0);
  expect(viewport.worldHeight).toBe(0);
  expect(viewport.threshold).toBe(5);
  expect(viewport.options.passiveWheel).toBe(true);
  expect(viewport.options.stopPropagation).toBe(false);
  expect(viewport.options.forceHitArea!).toBe(null);
  expect(viewport.options.noTicker).toBe(false);
  expect(viewport.options.interaction).toBe(null);
  expect(viewport.options.disableOnContextMenu).toBe(false);
  expect(viewport.options.divWheel).toEqual(document.body);
  // need to check this way because pixie-viewport uses the @pixi/ticker
  const ticker = require('@pixi/ticker');
  expect(viewport.options.ticker).toBe(ticker.Ticker.shared);
});

it('should set properties', () => {
  const ticker = new PIXI.Ticker() as MockedTicker;
  ticker.__name += '-2';

  const WrapperComponent = {
    template: `
    <PixiApplication>
      <PixiViewport
        :screenWidth="800"
        :screenHeight="600"
        :worldWidth="1000"
        :worldHeight="1000"
        :threshold="1"
        :passiveWheel="false"
        :stopPropagation="true"
        :forceHitArea="rectangle"
        :no-ticker="true"
        :interaction="interaction"
        :disableOnContextMenu="true"
        :divWheel="divWheel"
        :ticker="ticker"
      />
    </PixiApplication>
    `,
    components: {
      PixiApplication,
      PixiViewport,
    },
    data() {
      return {
        rectangle: new PIXI.Rectangle(0, 0, 100, 100),
        interaction: { __name: 'mocked-pixi-interaction' },
        divWheel: document.createElement('div'),
        ticker: ticker,
      };
    },
  };
  const wrapper = mount(WrapperComponent);
  const component = wrapper.findComponent(PixiViewport);
  const viewport = component.vm.viewport;

  expect(viewport.screenWidth).toBe(800);
  expect(viewport.screenHeight).toBe(600);
  expect(viewport.worldWidth).toBe(1000);
  expect(viewport.worldHeight).toBe(1000);
  expect(viewport.threshold).toBe(1);
  expect(viewport.options.passiveWheel).toBe(false);
  expect(viewport.options.stopPropagation).toBe(true);
  expect(viewport.options.forceHitArea!).toMatchObject({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  expect(viewport.options.noTicker).toBe(true);
  expect(viewport.options.interaction).toEqual({
    __name: 'mocked-pixi-interaction',
  });
  expect(viewport.options.disableOnContextMenu).toBe(true);
  expect(viewport.options.divWheel).not.toEqual(document.body);
  expect((viewport.options.ticker as unknown as MockedTicker).__name).toEqual(
    ticker.__name
  );
});

it('should have no plugin set by default', () => {
  const wrapper = mount(PixiApplication, {
    slots: {
      default: [PixiViewport],
    },
  });
  const component = wrapper.findComponent(PixiViewport);
  const viewport = component.vm.viewport;

  expect(viewport.plugins.list).toHaveLength(0);
});

it.each([
  ['drag'],
  ['clamp'],
  ['decelerate'],
  ['bounce'],
  ['pinch'],
  ['snap'],
  ['follow'],
  ['wheel'],
  ['animate'],
  ['clamp-zoom'],
  ['mouse-edges'],
])('should enable %s plugin when property is set', (pluginName) => {
  const WrapperComponent = {
    template: `
    <PixiApplication>
      <PixiViewport
        :${pluginName}="options"
      />
    </PixiApplication>
    `,
    components: {
      PixiApplication,
      PixiViewport,
    },
    data() {
      return {
        options: {},
      };
    },
  };
  const wrapper = mount(WrapperComponent);
  const component = wrapper.findComponent(PixiViewport);
  const viewport = component.vm.viewport;

  expect(viewport.plugins.list).toHaveLength(1);
  expect(viewport.plugins.get(pluginName)).not.toBeNull();
  expect(viewport.plugins.get(pluginName)).not.toBeUndefined();
});

it.each([
  ['drag'],
  ['clamp'],
  ['decelerate'],
  ['bounce'],
  ['pinch'],
  ['snap'],
  ['follow'],
  ['wheel'],
  ['animate'],
  ['clamp-zoom'],
  ['mouse-edges'],
])(
  'should enable %s plugin when property is set without value',
  (pluginName) => {
    const WrapperComponent = {
      template: `
    <PixiApplication>
      <PixiViewport
        :${pluginName}
      />
    </PixiApplication>
    `,
      components: {
        PixiApplication,
        PixiViewport,
      },
    };
    const wrapper = mount(WrapperComponent);
    const component = wrapper.findComponent(PixiViewport);
    const viewport = component.vm.viewport;

    expect(viewport.plugins.list).toHaveLength(1);
    expect(viewport.plugins.get(pluginName)).not.toBeNull();
    expect(viewport.plugins.get(pluginName)).not.toBeUndefined();
  }
);

it.each(EVENTS.map((event) => [event]))(
  'should receive %s when emitted',
  (event) => {
    const wrapper = mount(PixiApplication, {
      slots: {
        default: [PixiViewport],
      },
    });
    const component = wrapper.getComponent(PixiViewport);
    const viewport = component.vm.viewport;

    const data = {
      viewport: true,
      type: 'test',
    } as const;
    viewport.emit(event, data);

    expect(component.emitted<[typeof data]>(event)![0][0]).toEqual(data);
  }
);

it('should register all listeners to all events', () => {
  const wrapper = mount(PixiApplication, {
    slots: {
      default: [PixiViewport],
    },
  });
  const component = wrapper.getComponent(PixiViewport);
  const viewport = component.vm.viewport;

  EVENTS.forEach((event) => {
    expect(viewport.listenerCount(event)).toBe(1);
  });
});

it('should remove all listeners to all events on unmount', () => {
  const wrapper = mount(PixiApplication, {
    slots: {
      default: [PixiViewport],
    },
  });
  wrapper.unmount();
  const component = wrapper.getComponent(PixiViewport);
  const viewport = component.vm.viewport;

  EVENTS.forEach((event) => {
    expect(viewport.listenerCount(event)).toBe(0);
  });
});
