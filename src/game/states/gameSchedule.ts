import { ISyncPointPrefab } from 'sim-ecs';

import {
  GameTimeSystem,
  InputSystem,
  TargetSystem,
  BehaviorTreeSystem,
  FollowSystem,
  KeyboardControlledSystem,
  MouseSelectionSystem,
  HealthSystem,
  MoveVelocitySystem,
  SpriteRenderSystem,
  MouseControlledSystem,
  AliveSystem,
  MovePositionDirectSystem,
  MovePathSystem,
  GridRenderSystem,
  GraphicsRenderSystem,
  UnitStateSystem,
  MapRenderSystem,
  SoundsSystem,
  AnimatorSystem,
  LoadScenarioSystem,
  SensorySystem,
  CombatSystem,
} from '../systems';

export const gameSchedule: ISyncPointPrefab = {
  stages: [
    [GameTimeSystem],
    [InputSystem],
    [MouseControlledSystem, KeyboardControlledSystem],
    [MouseSelectionSystem],
    [AliveSystem],
    [HealthSystem],
    [
      SensorySystem,
      BehaviorTreeSystem,
      TargetSystem,
      FollowSystem,
      CombatSystem,
      UnitStateSystem,
    ],
    [MovePathSystem, MovePositionDirectSystem, MoveVelocitySystem],
    [AnimatorSystem, SoundsSystem],
    [
      MapRenderSystem,
      GridRenderSystem,
      SpriteRenderSystem,
      GraphicsRenderSystem,
    ],
  ],
  after: {
    stages: [[LoadScenarioSystem]],
  },
};
