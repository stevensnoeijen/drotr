import * as fs from 'fs';

import { UnitType, UnitState, MoveDirection, UNIT_TYPES, UNIT_STATES, MOVE_DIRECTIONS } from './../src/game/types';

const colors = ['red', 'blue'] as const;
type Color = typeof colors[number];

const colorlessUnits: ReadonlyArray<UnitType> = ['catapult', 'cannon'];
const animatedUnits: ReadonlyArray<UnitType> = [
  'swordsmen',
  'crossbowsoldier',
  'knight',
  'juggernaut',
];

const animationStates: ReadonlyArray<UnitState> = ['move', 'attack', 'dead'];
const loopStates: ReadonlyArray<UnitState> = ['move', 'attack'];

type BaseAnimation = {
  loop: boolean;
  speed: number;
};

type ModelState = {
  [direction in MoveDirection]:
    | (BaseAnimation & { animation: string })
    | { texture: string };
};

type Model = {
  unit: UnitType;
  color: Color;
  states: {
    [state in UnitState]: ModelState;
  };
};

const getAnimationKey = (
  unit: UnitType,
  color: Color,
  state: UnitState,
  direction: MoveDirection
): string | null => {
  if (!animatedUnits.includes(unit)) {
    state = 'idle';
  }

  if (colorlessUnits.includes(unit)) {
    // have no color in their texture
    return `${unit}.${state}.${direction}`;
  }
  return `${unit}.${color}.${state}.${direction}`;
};

const models: Model[] = [];

for (const unit of UNIT_TYPES) {
  const isAnimatedUnit = animatedUnits.includes(unit);

  for (const color of colors) {
    const model = {
      unit,
      color,
      states: {},
    } as Model;

    for (const state of UNIT_STATES) {
      const modelState = {} as ModelState;
      for (const direction of MOVE_DIRECTIONS) {
        const animationName = getAnimationKey(unit, color, state, direction);

        if (isAnimatedUnit && animationStates.includes(state)) {
          modelState[direction] = {
            animation: animationName,
            speed: 0.25,
            loop: loopStates.includes(state),
          };
        } else {
          modelState[direction] = {
            texture: animationName,
          };
        }
      }
      model.states[state] = modelState;
    }

    models.push(model);
  }
}
fs.writeFileSync(
  __dirname + '/../public/assets/animation-models.json',
  JSON.stringify(
    {
      spritesheet: '/assets/unit-spritesheet.json',
      models,
    },
    null,
    2
  )
);
