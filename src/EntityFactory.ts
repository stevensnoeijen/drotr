import { World } from 'ecsy';
import * as PIXI from 'pixi.js';

import { SpriteComponent } from './components/SpriteComponent';
import { TextComponent } from './components/TextComponent';
import { MovableComponent } from './components/MovableComponent';
import { SelectorComponent } from './components/SelectorComponent';
import { SizeComponent } from './components/SizeComponent';
import { TransformComponent } from './components/TransformComponent';
import { Constants } from './Constants';
import { ShapeComponent } from './components/ShapeComponent';
import { RenderComponent } from './components/RenderComponent';
import { LayerComponent } from './components/LayerComponent';
import { FpsComponent } from './components/FpsComponent';
import { VisibilityComponent } from './components/VisibilityComponent';
import { SelectableComponent } from './components/SelectableComponent';
import { HealthComponent } from './components/HealthComponent';
import { AliveComponent } from './components/AliveComponent';
import { Vector2 } from './math/Vector2';
import { Text } from './graphics/Text';
import { Rectangle } from './graphics/shapes/Rectangle';
import { ShapeFactory } from './graphics/shapes/ShapeFactory';
import { PlayerMovementMouseComponent } from './components/PlayerMovementMouseComponent';
import { MovePositionDirectComponent } from './components/MovePositionDirectComponent';
import { PlayerMovementKeysComponent } from './components/PlayerMovementKeysComponent';
import { MoveVelocityComponent } from './components/MoveVelocityComponent';

type Position = { x: number; y: number };

interface IUnitProps {
	position: Position;
	color: 'red' | 'blue';
	texture: PIXI.Texture<PIXI.Resource>;
}

interface ISelectorProps {
	position: Position;
	static?: boolean;
}

interface IFpsCounterProps {
	position: Position;
}

export class EntityFactory {
	static first = true;

	public static createUnit(world: World, props: IUnitProps): void {
		const width = Constants.CELL_SIZE;
		const height = Constants.CELL_SIZE;
		let rotation = Math.random() * 360;
		rotation -= rotation % 90;
		const triangle = ShapeFactory.triangle(Constants.CELL_SIZE);
		triangle.fillStyle = props.color;

		const sprite = new PIXI.Sprite(props.texture);
		sprite.anchor.set(0.5);
		sprite.position.set(props.position.x, props.position.y);

		world
			.createEntity()
			.addComponent(RenderComponent)
			.addComponent(ShapeComponent, {
				shape: triangle,
			})
			.addComponent(TransformComponent, {
				position: new Vector2(props.position.x, props.position.y),
				rotation: rotation,
			})
			.addComponent(SizeComponent, {
				width: width,
				height: height,
			})
			.addComponent(MovableComponent)
			.addComponent(LayerComponent, {
				layer: Constants.LAYER_UNITS,
			})
			.addComponent(SelectableComponent)
			.addComponent(HealthComponent, {
				points: Math.round(Math.random() * 10),
				maxPoints: 10,
			})
			.addComponent(AliveComponent)
			.addComponent(MoveVelocityComponent, {
				moveSpeed: 50,
			})
			.addComponent(PlayerMovementKeysComponent)
			.addComponent(MovePositionDirectComponent)
			.addComponent(PlayerMovementMouseComponent)
			.addComponent(SpriteComponent, {
				sprite: sprite,
			})

	}

	public static createSelector(world: World, props: ISelectorProps): void {
		world
			.createEntity()
			.addComponent(ShapeComponent, {
				shape: new Rectangle({
					lineStyle: 'black',
					anchor: 'top-left',
					lineWidth: 1,
					size: {
						width: 0,
						height: 0,
					},
				}),
			})
			.addComponent(RenderComponent)
			.addComponent(TransformComponent, {
				position: new Vector2(props.position.x, props.position.y),
			})
			.addComponent(SizeComponent, {
				width: 100,
				height: 100,
			})
			.addComponent(SelectorComponent)
			.addComponent(VisibilityComponent, {
				visible: false,
			})
			.addComponent(LayerComponent, {
				layer: Constants.LAYER_UI,
			});
	}

	public static createFpsCouter(world: World, props: IFpsCounterProps): void {
		world
			.createEntity()
			.addComponent(RenderComponent)
			.addComponent(TextComponent, {
				text: new Text({
					text: '0',
					font: '12px Arial',
					color: 'black',
				}),
			})
			.addComponent(FpsComponent)
			.addComponent(TransformComponent, {
				position: new Vector2(props.position.x, props.position.y),
			})
			.addComponent(LayerComponent, {
				layer: Constants.LAYER_UI,
			});
	}
}
