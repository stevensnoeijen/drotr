import { Actions, createSystem, IWorld } from 'sim-ecs';
import { Sound as PixiSound } from '@pixi/sound';

import { Engine } from '../Engine';
import { AnimationService } from '../animation/AnimationService';
import { AnimationModelsJson } from '../animation/api';
import { ObjectsJson } from '../data/ObjectsJson';
import { SoundService } from '../sounds/SoundService';
import { EntityLoader } from '../EntityLoader';
import { ScenarioLoaded } from '../events/ScenarioLoaded';

import { worldEventBus } from './../constants';

const getAnimationService = (engine: Engine) => {
  return new AnimationService(
    engine.app.loader.resources['unit-spritesheet'].spritesheet!,
    engine.app.loader.resources['animation-models'].data as AnimationModelsJson
  );
};

const getSoundService = (engine: Engine) => {
  const sounds = PixiSound.from({
    url: 'assets/sounds.mp3',
    sprites: (engine.app.loader.resources['sounds'].data as audiosprite.Result).spritemap,
  });

  return new SoundService(
    sounds,
  );
};

const getEntityLoader = (world: IWorld, engine: Engine) => {
  return new EntityLoader(
    world,
    engine.app.loader.resources['objects'].data as ObjectsJson,
    getAnimationService(engine),
    getSoundService(engine),
  );
};

export const LoadScenarioSystem = createSystem({
    actions: Actions,
  })
  .withSetupFunction(({ actions }) => {
    const engine = actions.getResource(Engine);

    if (engine.scenario == null) {
      throw new Error('No scenario loaded');
    }

    engine.scenario.load(getEntityLoader(engine.world, engine));

    worldEventBus.publish(new ScenarioLoaded(engine.scenario!));
  })
  .build();
