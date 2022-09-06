import * as PIXI from 'pixi.js';
import { buildWorld, Entity, IWorld } from 'sim-ecs';
import { nanoid } from 'nanoid';

import { gameSchedule } from './states/gameSchedule';
import { getOptions } from './utils';
import { EventBus } from './EventBus';
import { Events } from './Events';
import { Scenario } from './scenarios/Scenario';
import { GameState } from './states/GameState';
import { ScenarioConstructor } from './scenarios/types';

Entity.uuidFn = nanoid;

export class Engine {
  public readonly world: IWorld;
  private _scenario: Scenario | null = null;

  constructor(public readonly app: PIXI.Application) {
    this.world = buildWorld()
      .withComponents(PIXI.Graphics, PIXI.Sprite, PIXI.AnimatedSprite)
      .withStateScheduling(GameState, root => root.fromPrefab(gameSchedule))
      .build();
    this.world.addResource(app);// TODO: remove me, replace all getResouce(PIXI.Application) with Engine.app
    this.world.addResource(this);
    this.world.addResource(new EventBus<Events>());// TODO: remove me when replaced with sim-ecs events
    this.world.addResource(getOptions());

    this.app.loader
      .add('objects', 'assets/objects.json')
      .add('unit-spritesheet', 'assets/unit-spritesheet.json')
      .add('animation-models', 'assets/animation-models.json')
      .add('sounds', '/assets/sounds.json');
  }

  public async run() {
    this.app.loader
      .load(() => {
        this.world.run({
          initialState: GameState,
        });
      });
  }

  public get scenario () {
    return this._scenario;
  }

  public setScenario(scenarioConstructor: ScenarioConstructor) {
    this._scenario = new scenarioConstructor(this.app, this);
  }
}
