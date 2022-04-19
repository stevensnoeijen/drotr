import { PixiJsSystem } from "../../PixiJsSystem";
import { SpriteComponent } from './SpriteComponent';

export class SpriteSystem extends PixiJsSystem {
	public static queries = {
		sprites: { components: [SpriteComponent] },
	};

	// This method will get called on every frame by default
	public execute(delta: number, time: number): void {
		if ((this.queries.sprites.results?.length ?? 0) > 0) {
			for (const entity of this.queries.sprites.results) {
				const component = entity.getMutableComponent(SpriteComponent)!;

				if (!component.addedToStage) {
					this.app.stage.addChild(component.sprite);

					component.addedToStage = true;
				}
			}
		}
	}
}
