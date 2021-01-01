import { Text } from './../components/Text';
import { Constants } from './../Constants';
import { Size } from './../components/Size';
import { Position } from './../components/Position';
import { System, World, Attributes, Entity } from 'ecsy';
import { Renderable } from '../components/Renderable';
import { Layered } from '../components/Layered';
import { Shape } from '../components/Shape';

export class RendererSystem extends System {
	public static queries = {
		renderables: { components: [Renderable, Position] },
	};

	private canvas: HTMLCanvasElement;
	private context: CanvasRenderingContext2D;

	constructor(world: World, attributes: Attributes) {
		super(world, attributes);

		this.canvas = attributes.canvas;
		this.context = this.canvas.getContext('2d')!;
	}

	// This method will get called on every frame by default
	public execute(delta: number, time: number): void {
		// clear canvas
		this.context.clearRect(0, 0, Constants.GAME_WIDTH, Constants.GAME_HEIGHT);

		this.context.canvas.removeEventListener;

		const renderables = this.queries.renderables.results.sort(Layered.compare);

		// Iterate through all the entities on the query
		renderables.forEach((entity: Entity) => {
			if (entity.hasComponent(Shape)) {
				const shape = entity.getComponent(Shape);
				if (undefined === shape) {
					return; // skip
				}

				if (shape.type === 'rectangle') {
					this.drawRect(entity);
				}
			}
			if (entity.hasComponent(Text)) {
				this.renderText(entity);
			}
		});
	}

	private drawRect(entity: Entity): void {
		const shape = entity.getComponent(Shape)!;
		const position = entity.getComponent(Position)!;
		const size = entity.getComponent(Size)!;

		this.context.beginPath();

		this.context.rect(position.x, position.y, size.width, size.height);
		if (shape.fillStyle) {
			this.context.fillStyle = shape.fillStyle;
			this.context.fill();
		}

		if (shape.lineWidth && shape.lineWidth > 0) {
			this.context.lineWidth = shape.lineWidth;
			this.context.strokeStyle = shape.lineStyle || '#000';
			this.context.stroke();
		}
	}

	private renderText(entity: Entity): void {
		const text = entity.getComponent(Text)!;
		const position = entity.getComponent(Position)!;

		this.context.font = text.font;
		this.context.fillStyle = text.color;
		this.context.fillText(text.text, position.x, position.y);
	}
}
