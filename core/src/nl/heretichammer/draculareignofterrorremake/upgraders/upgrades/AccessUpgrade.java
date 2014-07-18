package nl.heretichammer.draculareignofterrorremake.upgraders.upgrades;

import nl.heretichammer.draculareignofterrorremake.team.Team;

public class AccessUpgrade extends AbstractUpgrade<AccessUpgrade.AccessUpgradeData> {

	public AccessUpgrade(AccessUpgradeData data) {
		super(data);
	}
	
	@Override
	protected void upgrade() {
		Team team = getTeam();
		if(team != null) {
			for(String access : data.accesses) {
				team.accessManager.putAccessable(access, true);
			}
		}
		//make itself un-accessable
		team.accessManager.putAccessable(data.accessName, false);
	}	
	
	public static class AccessUpgradeData extends Upgrade.UpgradeData {
		public String[] accesses;
	}
}