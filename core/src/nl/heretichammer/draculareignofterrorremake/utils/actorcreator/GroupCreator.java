package nl.heretichammer.draculareignofterrorremake.utils.actorcreator;

import nl.heretichammer.draculareignofterrorremake.utils.ActorLoader;

import com.badlogic.gdx.math.Rectangle;
import com.badlogic.gdx.scenes.scene2d.Group;
import com.badlogic.gdx.utils.ObjectMap;
import com.badlogic.gdx.utils.XmlReader;

public class GroupCreator<T extends Group> extends ActorCreator<T> {

	public GroupCreator(ActorLoader actorLoader) {
		super(actorLoader);
	}
	
	@Override
	public T create(XmlReader.Element element) {
		Group group = new Group();
		set(group, element);
		return (T)group;
	}
	
	@Override
	protected void set(Group group, XmlReader.Element element) {
		super.set((T)group, element);
		
		ObjectMap<String, String> attributes = element.getAttributes();
		if(attributes != null){
			if(attributes.containsKey("cullingarea")){
				group.setCullingArea(parseRectangle(attributes.get("cullingarea")));
			}
			if(attributes.containsKey("debug")){
				String[] args = attributes.get("debug").split(",");
				if(args.length == 2){
					group.setDebug(Boolean.parseBoolean(args[0]), Boolean.parseBoolean(args[1]));
				}
			}
		}
		int count = element.getChildCount();
		if(count > 0){
			XmlReader.Element actors = element.getChildByName("actors");
			int actorcount = actors.getChildCount();
			//get actors
			for(int i = 0; i < actorcount; i++){
				group.addActor( actorLoader.create(actors.getChild(i)) );
			}
		}
	}
	
	protected Rectangle parseRectangle(String value){
		String[] args = value.split(",");
		return new Rectangle(Float.parseFloat(args[0]), Float.parseFloat(args[1]), Float.parseFloat(args[2]), Float.parseFloat(args[3]));
	}
}
