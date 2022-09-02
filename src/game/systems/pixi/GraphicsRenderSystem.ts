import * as PIXI from 'pixi.js';
import { Entity } from 'ecsy';
import { Graphics } from 'pixi.js';
import { createSystem, queryComponents, Read, ReadOptional, WriteResource } from 'sim-ecs';

import { SimEcsComponent } from '../SimEcsComponent';
import { Transform } from '../../components/Transform';
import { Size } from '../../components/Size';
import { Selectable } from '../../components/input/Selectable';
import { Combat } from '../../components/ai/Combat';
import { getSimComponent, hasSimComponent } from '../utils/index';

import { getHealthColor } from './utils';

import { EntityHelper } from '~/game/EntityHelper';
import { Options } from '~/game/utils';
import { Health } from '~/game/components/Health';
import { EcsyEntity } from '~/game/components/EcsyEntity';

const drawHealthBar = (
  entity: Entity,
  graphics: PIXI.Graphics,
): void => {
  graphics.beginFill(0x000000);
  graphics.drawRect(-8, 12, 16, 5);
  graphics.endFill();

  const health = entity.getComponent(SimEcsComponent)?.entity.getComponent(Health);
  if (health) {
    const percentage = health.points / health.maxPoints;
    graphics.beginFill(getHealthColor(percentage));
    graphics.drawRect(-7, 13, 14 * percentage, 3);
    graphics.endFill();
  }
};

const drawSelectionIndicators = (
  entity: Entity,
  graphics: PIXI.Graphics,
  size: Size,
): void => {
  const offset = 4;
  const left = -size.width / 2 - offset;
  const top = -size.height / 2 - offset;
  const right = size.width / 2 + offset;

  // top left
  graphics
    .lineStyle(1, 0x000000)
    .moveTo(left, -6)
    .lineTo(left, top)
    .lineTo(left / 2, top);

  // top right
  graphics
    .lineStyle(1, 0x000000)
    .moveTo(right / 2, top)
    .lineTo(right, top)
    .lineTo(right, -6);
};

const drawAggroRadius = (
  entity: Entity,
  graphics: PIXI.Graphics,
): void => {
  const combat = getSimComponent(entity, Combat);
  if (combat == null) {
    return;
  }

  graphics.lineStyle(1, 0xff0000);

  graphics.drawCircle(0, 0, combat.aggroRange);
};


let showAllHealth: boolean;
let showDebugAggro: boolean;

export const GraphicsRenderSystem = createSystem({
    options: WriteResource(Options),
    app: WriteResource(PIXI.Application),
    query: queryComponents({
      ecsyEntity: Read(EcsyEntity),
      graphics: Read(Graphics),
      sprite: ReadOptional(PIXI.Sprite),
      animatedSprite: ReadOptional(PIXI.AnimatedSprite),
      size: Read(Size),
    }),
  })
  .withSetupFunction(({ options }) => {
    showAllHealth = options.showallhealth !== undefined
      ? options.showallhealth[0] == 'true'
      : false;
    showDebugAggro = options.debug?.includes('aggro') ?? false;
  })
  .withRunFunction(({
    app,
    query
  }) => {
    query.execute(({ ecsyEntity, graphics, sprite, animatedSprite, size }) => {
      // FIXME: graphics is added multiple times, optimise this
      app.stage.addChild(graphics as PIXI.Graphics);

      const entity = ecsyEntity.entity;
      if (hasSimComponent(entity, Selectable)) {
        const position = getSimComponent(entity, Transform)!.position;
        const target = (sprite ?? animatedSprite) as PIXI.Sprite;

        graphics.clear();
        graphics.position.set(position.x, position.y);

        if (EntityHelper.isSelected(entity)) {
          drawSelectionIndicators(entity, graphics as PIXI.Graphics, size);
        }
        if (showAllHealth || EntityHelper.isSelected(entity)) {
          drawHealthBar(entity, graphics as PIXI.Graphics);
        }

        if (showDebugAggro) {
          drawAggroRadius(entity, graphics as PIXI.Graphics);
        }
      } else {
        graphics.clear();
      }
    });
  })
  .build();