package nl.heretichammer.draculareignofterrorremake.models.upgraders;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Queue;

import nl.heretichammer.draculareignofterrorremake.annotations.ResourceCost;
import nl.heretichammer.draculareignofterrorremake.annotations.Upgrade;
import nl.heretichammer.draculareignofterrorremake.exceptions.InsufficientResources;
import nl.heretichammer.draculareignofterrorremake.models.Model;
import nl.heretichammer.draculareignofterrorremake.models.Resource;
import nl.heretichammer.draculareignofterrorremake.models.ResourceSuppliable;
import nl.heretichammer.draculareignofterrorremake.models.ResourceSupplier;
import nl.heretichammer.draculareignofterrorremake.models.events.DoneEvent;
import nl.heretichammer.draculareignofterrorremake.models.events.EndedEvent;
import nl.heretichammer.draculareignofterrorremake.models.events.LevelChangedEvent;
import nl.heretichammer.draculareignofterrorremake.models.events.StartedEvent;
import nl.heretichammer.draculareignofterrorremake.models.events.TimeChangedEvent;
import nl.heretichammer.draculareignofterrorremake.models.team.Team;

public abstract class Upgrader extends Model implements ResourceSuppliable {
	protected static final String SOUND_UPGRADING_CANCELLED = "upgrading cancelled.ogg";
	
	private ResourceSupplier resourceSupplier;
	private Queue<UpgradeMethod> upgrades;
	private int level = 1;
	private boolean started = false;
	private boolean done = false;
	private String image;
	protected Team team;
	
	@SuppressWarnings("unchecked")
	public Upgrader() {
		upgrades = new LinkedList<>();
		for(Method method : this.getClass().getDeclaredMethods()){
			if(method.isAnnotationPresent(Upgrade.class)){
				UpgradeMethod updateMethod = new UpgradeMethod(method);
				upgrades.add(updateMethod);
			}
		}
		Collections.sort((List<UpgradeMethod>)upgrades);
		image = upgrades.peek().getImage();
	}
	
	public void setTeam(Team team) {
		this.team = team;
	}
	
	public abstract String getName();
	
	public String getImage(){
		return image;
	}

	public int getLevel() {
		return this.level;
	}
	
	public void setLevel(int level) {
		this.level = level;
		//remove levels before
		while(upgrades.peek().getLevel() < level){
			upgrades.remove();
		}
		image = upgrades.peek().getImage();
		post(new LevelChangedEvent());
	}
	
	public boolean canPayNextUpgrade(){
		return upgrades.peek().canPay();
	}
	
	public boolean isStarted(){
		return started;
	}
	
	public boolean isDone() {
		return done;
	}

	public void week() {
		if(started){
			UpgradeMethod current = upgrades.peek();
			current.week();
		}
	}
	
	public int getNextUpgradeCost(Resource resource){
		return upgrades.peek().getCost(resource);
	}
	
	public int getNextUpgradeCosts(Resource resource){
		return upgrades.peek().cost.get(resource);
	}
	
	public void startNextUpgrade(){
		upgrades.peek().start();
	}
	
	protected abstract int getStartLevel();
	
	public abstract int getMaxLevel();
	
	@Override
	public String toString() {
		return getName();
	}
	
	@Override
	public void setResourceSupplier(ResourceSupplier resourceSupplier) {
		this.resourceSupplier = resourceSupplier;
	}
	
	private void setStarted(boolean started){
		this.started = started;
		if(started){
			post(new StartedEvent());
		}else{
			post(new EndedEvent());
		}
	}
	
	public abstract String getStartSound();
	
	public abstract String getCancelSound();
	
	public class UpgradeMethod implements Comparable<UpgradeMethod> {
		private Upgrade upgrade;
		private Method method;
		/**
		 * All costs except {@link Resource#TIME}
		 */
		private Map<Resource, Integer> cost;
		private int time = 0;
		
		private UpgradeMethod(Method method) {
			upgrade = method.getAnnotation(Upgrade.class);			
			cost = new EnumMap<Resource, Integer>(Resource.class);
			ResourceCost cost = upgrade.cost();
			this.cost.put(Resource.GOLD, cost.gold());
			this.cost.put(Resource.TIME, cost.time());
			this.cost.put(Resource.FOOD, cost.food());
			this.cost.put(Resource.WOOD, cost.wood());
		}
		
		public int getCost(Resource resource){
			return this.cost.get(resource);
		}
		
		public boolean canPay(){
			for(Resource resource : cost.keySet()){
				if(resource != Resource.TIME){
					if(!resourceSupplier.hasResource(resource, cost.get(resource))){
						return false;
					}
				}
			}
			return true;
		}
		
		public boolean isStarted(){
			return started;
		}
		
		public void start(){
			pay();
			setStarted(true);
		}
		
		private void pay(){
			if(canPay()){
				for(Resource resource : cost.keySet()){
					if(resource != Resource.TIME){
						resourceSupplier.decrementResource(resource, cost.get(resource));
					}
				}
			}else{
				throw new InsufficientResources();
			}
		}
		
		private void refund(){
			for(Resource resource : cost.keySet()){
				if(resource != Resource.TIME){
					resourceSupplier.incrementResource(resource, cost.get(resource));
				}
			}
		}
		
		private void setTime(int time){
			this.time = time;
			post(new TimeChangedEvent());
		}
		
		public void cancel(){
			if(isStarted()){
				refund();
				setTime(0);
				setStarted(false);
			}
		}
		
		protected void week(){
			setTime(time+1);
			if(cost.get(Resource.TIME) == time){
				done();
			}
		}
		
		private void done(){
			try {
				upgrades.poll();//remove self
				method.invoke(this);
				image = upgrades.peek().getImage();
				post(new DoneEvent());
			} catch (IllegalAccessException | IllegalArgumentException | InvocationTargetException ex) {
				ex.printStackTrace();
			}
		}
		
		public int getLevel(){
			return upgrade.level();
		}
		
		public String getImage(){
			return upgrade.image();
		}
		
		@Override
		public int compareTo(UpgradeMethod other) {
			return Integer.compare(this.upgrade.level(), other.upgrade.level());
		}
	}
}
