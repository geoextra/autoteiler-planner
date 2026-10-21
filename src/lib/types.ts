/** Price class of a car; a key of `pricing.json`. */
export type CarClass = 'Klein' | 'Kompakt' | 'Mittel';

export interface CarClassPricing {
	/** € per km up to 200 km */
	upTo200km: number;
	/** € per km from km 201 on */
	above200km: number;
}

export interface Car {
	model: string;
	address: string;
	imageURL: string;
	coordinates: { lat: number; lng: number };
	carClass: CarClass;
}
