package nl.heretichammer.draculareignofterrorremake.items.containers;

import nl.heretichammer.draculareignofterrorremake.items.AbstractItem;
import nl.heretichammer.draculareignofterrorremake.items.Closeable;
import nl.heretichammer.draculareignofterrorremake.items.Item;
import nl.heretichammer.draculareignofterrorremake.items.Key;
import nl.heretichammer.draculareignofterrorremake.items.Lock;
import nl.heretichammer.draculareignofterrorremake.items.Lockable;
import nl.heretichammer.draculareignofterrorremake.utils.ItemSupplier;

public abstract class ItemContainer<D extends ItemContainer.ItemContainerData> extends AbstractItem<D> implements Iterable<Item>, Closeable, Lockable, ItemSupplier {
	
	private Lock lock;
	private boolean open;
	
	public ItemContainer(D data, Lock lock) {
		this(data);
		this.lock = lock;
	}
	
	public ItemContainer(D data) {
		super(data);
	}

	@Override
	public void lock(Key key) {
		lock.lock(key);
	}

	@Override
	public boolean isLocked() {
		if(lock != null){
			return lock.isLocked();
		}
		return false;
	}

	@Override
	public void unlock(Key key) {
		lock.unlock(key);
	}
	
	@Override
	public void open() {
		open = true;
	}
	
	@Override
	public void close() {
		open = false;
	}
	
	@Override
	public boolean isOpen() {
		return open;
	}
	
	public abstract Item get(int index);
	
	public abstract int indexOf(Item item);
	
	public abstract boolean isEmpty();
	
	public abstract boolean remove(Item item);
	
	public abstract int getMaxSize();
	
	public abstract int getSize();
	
	public abstract Iterable<Item> findByCategory(String category);
	
	public static class ItemContainerData extends Item.ItemData{
		public Item.ItemDescriptor lock;
	}
}
