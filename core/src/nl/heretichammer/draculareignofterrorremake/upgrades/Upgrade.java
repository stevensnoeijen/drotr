package nl.heretichammer.draculareignofterrorremake.upgrades;

import nl.heretichammer.draculareignofterrorremake.items.Item;
import nl.heretichammer.draculareignofterrorremake.team.Teamable;
import nl.heretichammer.draculareignofterrorremake.team.access.Accessible;
import nl.heretichammer.draculareignofterrorremake.utils.ItemSuppliable;

/**
 * Strategy pattern.
 * @author Steven Snoeijen
 *
 */
public interface Upgrade extends ItemSuppliable, Teamable, Accessible {
	public String getName();
	public Item.ItemDescriptor[] getCost();
	public int getTurnCost();
	public boolean isStarted();
	public void start();
	public void stop();
	public boolean isDone();
	
	public static class UpgradeData {
		public String name;
		public Item.ItemDescriptor[] cost;
		public int turnCost;
	}
}