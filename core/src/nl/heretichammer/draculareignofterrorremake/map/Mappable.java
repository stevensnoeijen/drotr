package nl.heretichammer.draculareignofterrorremake.map;

public interface Mappable {
	public int getX();
	public int getY();
	public void setPosition(int x, int y);
	public void setArea(Area area);
	public Area getArea();
}
