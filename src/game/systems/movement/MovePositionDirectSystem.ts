import {
  createSystem,
  IEntity,
  queryComponents,
  Write,
  WriteEvents,
  ReadEntity,
  Read,
} from 'sim-ecs';
import { IEventWriter } from 'sim-ecs/dist/events';

import { Transform } from '../../components/Transform';
import { Vector2 } from '../../math/Vector2';
import { MoveVelocity } from '../../components/movement/MoveVelocity';
import { MovePositionDirect } from '../../components/movement/MovePositionDirect';

import { MovePath } from './../../components/movement/MovePath';

import { Idled } from '~/game/events/Idled';

const moveByMoveVelocity = (
  entity: IEntity,
  movePositionDirect: MovePositionDirect,
  moveVelocity: MoveVelocity,
  movePath: Readonly<MovePath>,
  transform: Transform,
  idled: IEventWriter<typeof Idled>
) => {
  if (movePositionDirect.position == null) return;

  if (Vector2.distance(transform.position, movePositionDirect.position) < 1) {
    transform.position = movePositionDirect.position;
    // stop
    movePositionDirect.position = null;
    moveVelocity.velocity = Vector2.ZERO;

    if (movePath.path.length === 0) idled.publish(new Idled(entity));

    return;
  }

  moveVelocity.velocity = Vector2.multiplies(
    Vector2.subtracts(
      movePositionDirect.position!,
      transform.position
    ).normalized(),
    moveVelocity.moveSpeed
  );
};

export const MovePositionDirectSystem = createSystem({
  idled: WriteEvents(Idled),

  query: queryComponents({
    entity: ReadEntity(),
    movePositionDirect: Write(MovePositionDirect),
    moveVelocity: Write(MoveVelocity),
    movePath: Read(MovePath),
    transform: Write(Transform),
  }),
})
  .withRunFunction(({ idled, query }) => {
    return query.execute(
      ({ entity, movePositionDirect, moveVelocity, movePath, transform }) => {
        return moveByMoveVelocity(
          entity,
          movePositionDirect,
          moveVelocity,
          movePath,
          transform,
          idled
        );
      }
    );
  })
  .build();
