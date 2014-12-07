package nl.heretichammer.draculareignofterrorremake.utils.actorcreator;

import nl.heretichammer.draculareignofterrorremake.utils.ActorLoader;

import com.badlogic.gdx.scenes.scene2d.ui.WidgetGroup;
import com.badlogic.gdx.utils.ObjectMap;
import com.badlogic.gdx.utils.XmlReader.Element;

public abstract class WidgetGroupCreator<T extends WidgetGroup> extends GroupCreator<T> {

	public WidgetGroupCreator(ActorLoader actorLoader) {
		super(actorLoader);
	}
	
	@Override
	protected void set(WidgetGroup widgetGroup , Element element) {
		super.set(widgetGroup, element);
		ObjectMap<String, String> attributes = element.getAttributes();
		if(attributes != null){
			if(attributes.containsKey("fillparent")){
				widgetGroup.setFillParent(Boolean.parseBoolean(attributes.get("fillparent")));
			}
			if(attributes.containsKey("layoutenabled")){
				widgetGroup.setLayoutEnabled(Boolean.parseBoolean(attributes.get("layoutenabled")));
			}
		}
	}
}
