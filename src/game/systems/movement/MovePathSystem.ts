import { createSystem, IEntity, queryComponents, Read, ReadEntity, Write, ReadOptional, WriteEvents } from 'sim-ecs';
import { IEventWriter } from 'sim-ecs/dist/events';

import { cellPositionToVector } from '../../utils';
import { Vector2 } from '../../math/Vector2';
import { Transform } from '../../components/Transform';
import { MovePositionDirect } from '../../components/movement/MovePositionDirect';
import { Controlled } from '../../components/input/Controlled';
import { StartedMoving } from '../../events/StartedMoving';

import { MoveVelocity } from './../../components/movement/MoveVelocity';
import { getCell, not, Position } from './../../utils';
import { isSameEntity } from './../utils/index';

import { MovePath } from '~/game/components/movement/MovePath';

const canEntityMoveToCell = (
  colliders: IEntity[],
  entity: IEntity,
  cell: Position
): boolean => {
  const collider = colliders.filter(
      not(isSameEntity(entity))
    ).find((collider) => {
      const colliderCell = getCell(collider);

      return cell.x === colliderCell.x && cell.y === colliderCell.y;
    });

  return collider == null;
};

const updateMovePosition = (
  entities: IEntity[],
  entity: IEntity,
  movePath: MovePath,
  moveVelocity: MoveVelocity,
  movePositionDirect: MovePositionDirect,
  controlled: Controlled | null,
  startedMoving: IEventWriter<typeof StartedMoving>,
) => {
  if (movePath.path.length == 0) {
    if (
      moveVelocity?.velocity != null &&
      Vector2.ZERO.equals(moveVelocity.velocity)
    ) {
      if (controlled != null)
      controlled.by = null;
    }

    return;
  }

  if (movePositionDirect.movePosition != null) {
    // is currently moving
    return;
  }

  const nextCell = movePath.path[0];

  if (
    !canEntityMoveToCell(
      entities,
      entity,
      nextCell
    )
  ) {
    // cancel move
    return;
  }
  movePath.path.shift();

  movePositionDirect.movePosition = cellPositionToVector(
    nextCell.x,
    nextCell.y
  );
  const transformComponent = entity.getComponent(Transform)!;
  if (
    !transformComponent.position.equals(
      movePositionDirect.movePosition
    )
  ) {
    transformComponent.rotation = Vector2.angle(
      transformComponent.position,
      movePositionDirect.movePosition
    );
  }

  if (!transformComponent.position.equals(Vector2.ZERO))// first cell
    startedMoving.publish(new StartedMoving(entity));
};

export const MovePathSystem = createSystem({
  startedMoving: WriteEvents(StartedMoving),

  query: queryComponents({
    entity: ReadEntity(),
    movePath: Write(MovePath),
    moveVelocity: Read(MoveVelocity),
    movePositionDirect: Write(MovePositionDirect),
    controlled: ReadOptional(Controlled),
  }),
})
.withRunFunction(({
  startedMoving,

  query,
}) => {
  query.execute(({ movePath, moveVelocity, entity, movePositionDirect, controlled }) => {
    updateMovePosition(
      Array.from(query.iter()).map(e => e.entity),
      entity,
      movePath,
      moveVelocity,
      movePositionDirect,
      controlled ?? null,
      startedMoving,
    );
  });
})
.build();
