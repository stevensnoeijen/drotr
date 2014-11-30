package nl.heretichammer.draculareignofterrorremake.models.upgraders;

import nl.heretichammer.draculareignofterrorremake.annotations.ResourceCost;
import nl.heretichammer.draculareignofterrorremake.annotations.Upgrade;
import nl.heretichammer.draculareignofterrorremake.models.Resource;
import nl.heretichammer.draculareignofterrorremake.models.team.Permission;
import nl.heretichammer.draculareignofterrorremake.models.team.Team;

public class ArmamentUpgrader extends Upgrader {
	private static final String SOUND_UPGRADING_ARMERMENT = "upgrading armerment.ogg";
	private static final String NAME = "Armament";

	public ArmamentUpgrader() {
		
	}

	@Override
	public String getName() {
		return NAME;
	}
	
	@Override
	protected int getStartLevel() {
		return 2;
	}
	
	@Override
	public int getMaxLevel() {
		return 5;
	}
	
	@Upgrade(level=1, cost={}, image="council.pack:upgrade-armament-1")
	protected void upgrade1(){
		
	}
	
	@Upgrade(level=2, cost={@ResourceCost(resource=Resource.GOLD, amount=200),@ResourceCost(resource=Resource.TIME, amount=8)}, image="council.pack:upgrade-armament-2")
	protected void upgrade2(){
		team.setPermission(Permission.KNIGHT, true);
		team.setPermission(Permission.SPY, true);
	}
	
	@Upgrade(level=3, cost={@ResourceCost(resource=Resource.GOLD, amount=250),@ResourceCost(resource=Resource.TIME, amount=10)}, image="council.pack:upgrade-armament-3")
	protected void upgrade3(){
		team.setPermission(Permission.CATAPULT, true);
	}
	
	@Upgrade(level=4, cost={@ResourceCost(resource=Resource.GOLD, amount=250),@ResourceCost(resource=Resource.TIME, amount=11)}, image="council.pack:upgrade-armament-4")
	protected void upgrade4(){
		team.setPermission(Permission.CANNON, true);
	}
	
	@Upgrade(level=5, cost={@ResourceCost(resource=Resource.GOLD, amount=300),@ResourceCost(resource=Resource.TIME, amount=13)}, image="council.pack:upgrade-armament-5")
	protected void upgrade5(){
		
	}

	@Override
	public String getStartSound() {
		return SOUND_UPGRADING_ARMERMENT;
	}

	@Override
	public String getCancelSound() {
		return SOUND_UPGRADING_CANCELLED;
	}
}