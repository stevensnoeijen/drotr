package nl.heretichammer.draculareignofterrorremake.models.producer;

import java.util.EnumMap;

import nl.heretichammer.draculareignofterrorremake.annotations.ResourceCost;
import nl.heretichammer.draculareignofterrorremake.annotations.Trooper;
import nl.heretichammer.draculareignofterrorremake.models.Resource;
import nl.heretichammer.draculareignofterrorremake.models.Troop;
import nl.heretichammer.draculareignofterrorremake.models.events.TeamChangedEvent;
import nl.heretichammer.draculareignofterrorremake.models.events.TroopProducedEvent;
import nl.heretichammer.draculareignofterrorremake.models.team.Team;
import nl.heretichammer.draculareignofterrorremake.models.units.Unit;

public class TroopProducer<T extends Unit> extends Producer<Troop<T>> {
	private Class<T> clazz;
	private Trooper trooper;
	private Team team;
	
	public TroopProducer(Class<T> clazz) {
		this.clazz = clazz;
		trooper = clazz.getAnnotation(Trooper.class);
		
		//set cost
		cost = new EnumMap<Resource, Integer>(Resource.class);
		ResourceCost cost = trooper.cost();
		this.cost.put(Resource.GOLD, cost.gold());
		this.cost.put(Resource.TIME, cost.time());
		if(cost.wood() != 0){
			this.cost.put(Resource.WOOD, cost.wood());
		}
		if(cost.food() != 0){
			this.cost.put(Resource.FOOD, cost.food());
		}
	}
	
	@Override
	protected void produce() {
		produced = new Troop<T>(trooper.size());
		for(int i = 0; i < trooper.size(); i++){
			T unit;
			try {
				unit = clazz.newInstance();
			} catch(Exception ex) {
				throw new RuntimeException(ex);
			}
			unit.setTeam(team);
			produced.addUnit(unit);
		}
		post(new TroopProducedEvent());
	}
	
	public String getTroopName() {
		return trooper.name();
	}

	public int getCost(Resource resource) {
		return cost.get(resource);
	}
	
	public int getResourceCost(Resource resource){
		return cost.get(resource);
	}
	
	public Trooper getTroopDate(){
		return trooper;
	}
	
	public Team getTeam() {
		return this.team;
	}
	
	public void setTeam(Team team) {
		this.team = team;
		post(new TeamChangedEvent());
	}
	
	public boolean isAccessable() {
		return team.hasPermission(trooper.permission());
	};
	
	@Override
	public String toString() {
		return trooper.name();
	}
}
