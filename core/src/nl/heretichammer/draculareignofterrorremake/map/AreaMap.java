package nl.heretichammer.draculareignofterrorremake.map;

import java.util.List;

import nl.heretichammer.draculareignofterrorremake.unit.Troop;

public class AreaMap {
	private Area area;
	
	public AreaMap(Area area) {
		this.area = area;
	}
	
	public List<Troop> getTroops(){
		return area.getTroops();
	}
}
