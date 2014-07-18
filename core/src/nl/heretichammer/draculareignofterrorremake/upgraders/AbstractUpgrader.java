package nl.heretichammer.draculareignofterrorremake.upgraders;

import nl.heretichammer.draculareignofterrorremake.exceptions.DataDoesNotExistsException;
import nl.heretichammer.draculareignofterrorremake.team.Team;
import nl.heretichammer.draculareignofterrorremake.upgraders.upgrades.Upgrade;
import nl.heretichammer.draculareignofterrorremake.upgraders.upgrades.UpgradeFactory;
import nl.heretichammer.draculareignofterrorremake.utils.AbstractTeamableAccessableStartable;
import nl.heretichammer.draculareignofterrorremake.utils.DRoTRUtils;
import nl.heretichammer.draculareignofterrorremake.utils.ItemSupplier;

public class AbstractUpgrader<D extends Upgrader.UpgraderData> extends AbstractTeamableAccessableStartable implements Upgrader {
	protected D data;
	private Upgrade[] upgrades;
	private Upgrade next;
	
	public AbstractUpgrader(D data) {
		this.data = data;
		//load upgrades
		int i = 0;
		upgrades = new Upgrade[data.upgrades.length];
		for(String upgradeName : data.upgrades) {
			upgrades[i] = UpgradeFactory.createAccessUpgrade(upgradeName);
			upgrades[i].setUpgrader(this);
			i++;
		}
	}
	
	@Override
	public void setTeam(Team team) {
		super.setTeam(team);
		DRoTRUtils.setTeam(team, upgrades);
	}
	
	@Override
	public void setItemSupplier(ItemSupplier itemSupplier) {
		DRoTRUtils.setItemSupplier(itemSupplier, upgrades);
	}

	@Override
	public boolean isAccessable() {
		return isAccessable(data.accessName);
	}

	@Override
	public String getName() {
		return data.name;
	}

	@Override
	public int getMaxLevel() {
		if(upgrades == null) {
			return 0;
		}
		return upgrades[upgrades.length-1].getLevel();
	}

	@Override
	public Upgrade getNext() {
		if(next == null || next.isDone()) {
			next();
		}		
		return next;
	}
	
	/**
	 * Sets {@link #next} to new upgrade.
	 */
	private void next() {
		for(Upgrade upgrade : upgrades) {
			if(upgrade == null) {
				throw new DataDoesNotExistsException();//array whould be filled
			}
			if(!upgrade.isDone()) {//sets to upgrade that is not done yet
				next = upgrade;
				break;//for
			}
		}
	}

	@Override
	public void onDone(Upgrade upgrade) {
		getTeam().accessManager.putAccessable(data.accessName + ".level", upgrade.getLevel());//set level that is done
		next();
	}
}