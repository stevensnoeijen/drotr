package nl.heretichammer.draculareignofterrorremake.utils.actorcreator;

import nl.heretichammer.draculareignofterrorremake.utils.ActorLoader;

import com.badlogic.gdx.scenes.scene2d.ui.Image;
import com.badlogic.gdx.scenes.scene2d.utils.Drawable;
import com.badlogic.gdx.utils.ObjectMap;
import com.badlogic.gdx.utils.Scaling;
import com.badlogic.gdx.utils.XmlReader.Element;

public class ImageCreator extends WidgetCreator<Image> {

	public ImageCreator(ActorLoader actorLoader) {
		super(actorLoader);
	}

	@Override
	public Image create(Element element, Object context) {
		Drawable drawable;
		if(element.getAttributes().containsKey("drawable") ){
			drawable = actorLoader.getLoadedAsset(element.get("drawable"), Drawable.class); 
		}else{
			drawable = null;
		}
		Image image = new Image(drawable);
		set(image, element, context);
		return image;
	}
	
	protected void set(Image image, Element element, Object context) {
		super.set(image, element, context);
		ObjectMap<String, String> attributes = element.getAttributes();
		if(attributes != null){
			if(attributes.containsKey("align")){
				image.setAlign(parseAlignment(attributes.get("align")));
			}
			if(attributes.containsKey("scaling")){
				image.setScaling(Scaling.valueOf(attributes.get("scaling")));
			}
		}
	};
}