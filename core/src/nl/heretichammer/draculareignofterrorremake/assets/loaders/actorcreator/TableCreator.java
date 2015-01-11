package nl.heretichammer.draculareignofterrorremake.assets.loaders.actorcreator;

import com.badlogic.gdx.assets.AssetDescriptor;
import com.badlogic.gdx.graphics.g2d.TextureAtlas;
import com.badlogic.gdx.scenes.scene2d.Actor;
import com.badlogic.gdx.scenes.scene2d.ui.Cell;
import com.badlogic.gdx.scenes.scene2d.ui.Skin;
import com.badlogic.gdx.scenes.scene2d.ui.Table;
import com.badlogic.gdx.scenes.scene2d.utils.Drawable;
import com.badlogic.gdx.utils.ObjectMap;
import com.badlogic.gdx.utils.XmlReader;
import com.badlogic.gdx.utils.XmlReader.Element;

public class TableCreator<T extends Table> extends WidgetGroupCreator<T> {

	public TableCreator(ActorLoader actorLoader) {
		super(actorLoader);
	}
	
	@Override
	public String getName() {
		return "table";
	}
	
	@SuppressWarnings("rawtypes")
	@Override
	public ObjectMap<String, AssetDescriptor> getDependencies(Element element) {
		ObjectMap<String, AssetDescriptor> dependencies = new ObjectMap<String, AssetDescriptor>();//create new, because groupcreator will fill it with it's children, which in table are row(s) and dont have dependencies themself
		if(element.getAttributes().containsKey("background")){
			String imageFile = element.getAttribute("background").split(":")[0];
			dependencies.put(imageFile, new AssetDescriptor<TextureAtlas>(imageFile, TextureAtlas.class));
		}
		//get row-element dependencies
		int count = element.getChildCount();
		for(int i = 0; i < count; i++){
			Element row = element.getChild(i);
			int rowchildcount = row.getChildCount();
			//get every child in the table
			for(int y = 0; y < rowchildcount; y++){
				dependencies.putAll( actorLoader.getDependencies(row.getChild(y)) );
			}
		}
		return dependencies;
	}
	
	@SuppressWarnings("unchecked")
	@Override
	public T create(Element element, Object context) {
		Table table = new Table();
		set(table, element, context);
		return (T) table;
	}
	
	@Override
	protected void set(Table table, Element element, Object context) {
		super.set(table, element, context);
		ObjectMap<String, String> attributes = element.getAttributes();
		if(attributes != null){
			if(attributes.containsKey("skin")){//if skin attribute is set it in the 
				Skin skin = actorLoader.getAsset(attributes.get("skin"), Skin.class);
				table.setSkin(skin);
			}
			if(attributes.containsKey("background")){//if skin attribute is set it in the 
				Drawable background = actorLoader.getAsset(attributes.get("background"), Drawable.class);
				table.setBackground(background);
			}
		}
		//rows are added in add method
	}
	
	/**
	 * Adds rows
	 */
	@Override
	protected void add(T table, Element element, Object context) {
		if(element.getName().equals("row")){
			createRow(element, table, context);
		}else{
			throw new UnsupportedOperationException();
		}
	};
	
	private Cell<?> createRow(XmlReader.Element element, Table table, Object context){
		Cell<?> cell = table.row();//create row
		setCell(cell, element, context);
		return cell;
	}
	
	private Cell<?> createCell(XmlReader.Element element, Table table, Object context){
		Cell<?> cell = table.add();
		setCell(cell, element, context);
		return cell;
	}
	
	/**
	 * Sets attributes to cell or row
	 * @param cell
	 * @param element
	 */
	private void setCell(Cell<?> cell, XmlReader.Element element, Object context){
		ObjectMap<String, String> attributes = element.getAttributes();
		if(attributes != null){//set attributes
			if(attributes.containsKey("align")){
				cell.align(parseAlignment(attributes.get("align")));
			}
			if(attributes.containsKey("colspan")){
				cell.colspan(Integer.parseInt(attributes.get("colspan")));
			}
			if(attributes.containsKey("expand")){
				String[] args = attributes.get("expand").replace(SPACE, "").split(SEPERATOR);
				cell.expand(Boolean.parseBoolean(args[0]), Boolean.parseBoolean(args[1]));
			}
			if(attributes.containsKey("fill")){
				String[] args = attributes.get("fill").replace(SPACE, "").split(SEPERATOR);
				cell.fill(Boolean.parseBoolean(args[0]), Boolean.parseBoolean(args[1]));
			}
			if(attributes.containsKey("height")){
				cell.height(Float.parseFloat(attributes.get("height")));
			}
			if(attributes.containsKey("width")){
				cell.width(Float.parseFloat(attributes.get("width")));
			}
			if(attributes.containsKey("maxheight")){
				cell.maxHeight(Float.parseFloat(attributes.get("maxheight")));
			}
			if(attributes.containsKey("maxwidth")){
				cell.maxWidth(Float.parseFloat(attributes.get("maxwidth")));
			}
			if(attributes.containsKey("pad")){
				String[] args = attributes.get("pad").replace(SPACE, "").split(SEPERATOR);
				cell.pad(Float.parseFloat(args[0]), Float.parseFloat(args[1]), Float.parseFloat(args[2]), Float.parseFloat(args[3]));
			}
			if(attributes.containsKey("prefheight")){
				cell.prefHeight(Float.parseFloat(attributes.get("prefheight")));
			}
			if(attributes.containsKey("prefwidth")){
				cell.prefWidth(Float.parseFloat(attributes.get("prefwidth")));
			}
			if(attributes.containsKey("space")){
				String[] args = attributes.get("space").replace(SPACE, "").split(SEPERATOR);
				cell.space(Float.parseFloat(args[0]), Float.parseFloat(args[1]), Float.parseFloat(args[2]), Float.parseFloat(args[3]));
			}
			if(attributes.containsKey("uniform")){
				String[] args = attributes.get("uniform").replace(SPACE, "").split(SEPERATOR);
				cell.uniform(Boolean.parseBoolean(args[0]), Boolean.parseBoolean(args[1]));
			}
		}
		if(element.getName().equals("row")){//if row
			for(XmlReader.Element rowcell : element.getChildrenByName("cell")){
				createCell(rowcell, cell.getTable(), context);//create cell from element
			}
		}else{//set actor to cell
			Actor inside = actorLoader.create(element.getChild(0), context);
			cell.setActor(inside);
		}
	}
}