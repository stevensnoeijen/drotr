package nl.heretichammer.draculareignofterrorremake.models.producer;

import nl.heretichammer.draculareignofterrorremake.models.Resource;
import nl.heretichammer.draculareignofterrorremake.models.events.ResourceProducedEvent;

public class ResourceProducer extends Producer<Integer> {

	/**
	 * Produces resource
	 */
	private Resource resource;
	private int produces;
	
	public ResourceProducer(Resource resource, int produces) {
		this.resource = resource;
		this.produces = produces;
	}

	public Resource getResource() {
		return this.resource;
	}
	
	public int getProduces() {
		return this.produces;
	}
	
	@Override
	protected void produce() {
		produced = produces;
		post(new ResourceProducedEvent());
	}
	
	@Override
	public int getCost(Resource resource) {
		return 0;
	}
}
