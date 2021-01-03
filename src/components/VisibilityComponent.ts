import { Component, Types } from 'ecsy';

interface IVisibilityComponentProps {
	visible: boolean;
}

export class VisibilityComponent extends Component<IVisibilityComponentProps> {
	visible: boolean;
}

VisibilityComponent.schema = {
	visible: { type: Types.Boolean, default: true },
};
