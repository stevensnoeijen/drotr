import { Entity, System, SystemQueries } from 'ecsy';
import { AliveComponent } from '../components/AliveComponent';
import { HealthComponent } from '../components/HealthComponent';
import { ShapeComponent } from '../components/ShapeComponent';
import { Rectangle } from '../graphics/shapes/Rectangle';

export class HealthSystem extends System {
    // Define a query of entities that have "Velocity" and "Position" components
    public static queries: SystemQueries = {
        healthy: {
            components: [HealthComponent],
            listen: {
                added: true,
                changed: true,
            },
        },
    };

    public execute(delta: number, time: number): void {

        if (this.queries.healthy.added !== undefined) {
            this.queries.healthy.added.forEach(this.updateStatus);
        }
        if (this.queries.healthy.changed !== undefined) {
            this.queries.healthy.changed.forEach(this.updateStatus);
        }
    }

    private updateStatus(entity: Entity): void {
        const health = entity.getComponent(HealthComponent);
        if (!health) {
            return;
        }
        if (!entity.hasComponent(AliveComponent)) {// if not alive
            return;
        }

        if (health.points === 0) {
            const aliveComponent = entity.getMutableComponent(AliveComponent);
            if (!aliveComponent) {
                return;
            }
            aliveComponent.alive = false;

            const shapeComponent = entity.getMutableComponent(ShapeComponent);
            if (!shapeComponent) {
                return;
            }
            (shapeComponent.shape as Rectangle).fillStyle = 'black';
        }
    }
}
