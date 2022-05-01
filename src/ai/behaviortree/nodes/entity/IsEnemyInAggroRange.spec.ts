import { World } from 'ecsy';

import { TransformComponent } from './../../../../systems/TransformComponent';
import { IsEnemyInAggroRange } from './IsEnemyInAggroRange';
import { Vector2 } from '../../../../math/Vector2';
import { Node, State } from '../Node';
import { TeamComponent } from './../../../../systems/TeamComponent';
import { getEntitiesInRange } from './utils';

jest.mock('./utils');

describe('IsEnemyInAggroRange', () => {
    describe('evaluate', () => {
        
        let world: World;

        beforeEach(() => {
            world = new World()
                .registerComponent(TransformComponent)
                .registerComponent(TeamComponent);

            (getEntitiesInRange as jest.MockedFunction<any>).mockClear();
        });


        it('should success set target when there is an enemy within range', () => {
            const entitiesInRange = [
                world.createEntity()
                    .addComponent(TransformComponent, {
                        position: new Vector2(0, 0),
                    })
                    .addComponent(TeamComponent, {
                        number: 2
                    })
            ];
            (getEntitiesInRange as jest.MockedFunction<any>).mockReturnValue(entitiesInRange);

            const entity = world.createEntity()
                .addComponent(TransformComponent, {
                    position: new Vector2(0, 0),
                })
                .addComponent(TeamComponent, {
                    number: 1
                });

            const node = new IsEnemyInAggroRange([]);
            const parent = new Node();
            parent.setData('entity', entity);
            parent.attach(node);

            expect(node.evaluate()).toBe(State.SUCCESS);
            expect(parent.getData('target')).not.toBeNull();
            expect(getEntitiesInRange).toBeCalledWith(expect.anything(), expect.anything(), 100);
        });

        it('should fail and not set target when there is no enemy within range', () => {
            (getEntitiesInRange as jest.MockedFunction<any>).mockReturnValue([]);

            const entity = world.createEntity()
                .addComponent(TransformComponent, {
                    position: new Vector2(0, 0),
                })
                .addComponent(TeamComponent, {
                    number: 1
                });


            const node = new IsEnemyInAggroRange([]);
            const parent = new Node();
            parent.setData('entity', entity);
            parent.attach(node);

            expect(node.evaluate()).toBe(State.FAILURE);
            expect(parent.getData('target')).toBeNull();
        });
    });
});