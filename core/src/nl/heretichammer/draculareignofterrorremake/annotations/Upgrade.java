package nl.heretichammer.draculareignofterrorremake.annotations;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Upgrade {
	int level();
	ResourceCost[] cost();
	String image();
}