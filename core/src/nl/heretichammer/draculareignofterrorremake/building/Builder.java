package nl.heretichammer.draculareignofterrorremake.building;

import nl.heretichammer.draculareignofterrorremake.ItemSupplier;
import nl.heretichammer.draculareignofterrorremake.building.Building;

public interface Builder {
	public void constructStart();
	public void constructStop();
	public void repairStart(Building building);
	public void repairStop(Building building);
	public void upgradeStart(Building building);
	public void upgradeStop(Building building);
	public void destructStart(Building building);
	public void destructStop(Building building);
	public void setItemSupplier(ItemSupplier itemSupplier);
}
