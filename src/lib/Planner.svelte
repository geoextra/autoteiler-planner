<script lang="ts">
	import mapboxgl from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import { MapboxSearchBox } from '@mapbox/search-js-web';
	import { onMount } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import defaultCars from './cars.json';
	import pricing from './pricing.json';
	import type { Car, CarClass, CarClassPricing } from './types';
	import { fly } from 'svelte/transition';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { MapPinAltSolid, ChevronDownOutline } from 'flowbite-svelte-icons';
	import {
		AccordionItem,
		Accordion,
		Badge,
		Toggle,
		Avatar,
		Button,
		Dropdown,
		DropdownItem
	} from 'flowbite-svelte';

	/**
	 * Trip cost planner: a Mapbox map with the club's cars that calculates the
	 * cost of a trip. Fills its container, so give the parent element a height.
	 */
	const carClassPricing = pricing as Record<CarClass, CarClassPricing>;

	let { cars = defaultCars as Car[], accessToken }: { cars?: Car[]; accessToken: string } =
		$props();

	let selectedCar = $state(cars[0]);
	let isDropdownOpen = $state(false);

	// Map mode: flat by default, tilted with 3D buildings and terrain on demand
	let is3D = $state(false);

	// Helper functions
	function formatDistance(km: number): string {
		return `${km.toFixed(1).replace('.', ',')} km`;
	}

	function formatPrice(price: number): string {
		return `${price.toFixed(2).replace('.', ',')} €`;
	}

	function parseTime(timeString: string): { hours: number; minutes: number } | null {
		if (!timeString) return null;
		const [hours, minutes] = timeString.split(':').map(Number);
		if (isNaN(hours) || isNaN(minutes)) return null;
		return { hours, minutes };
	}

	// Base state variables
	let routeDistance = $state(0); // km
	let routeDuration = $state(0); // minutes
	let returnRouteDistance = $state(0); // km
	let returnRouteDuration = $state(0); // minutes
	let hoursAtDestination = $state(1);
	let startTime = $state('09:00');
	let detailsVisible = $state(false);
	let placeName = $state('');
	let currentDestination = $state<mapboxgl.LngLat | null>(null);

	// Tweened values for animations
	const tweenOptions = { duration: 800, easing: cubicOut };
	const kmPriceTween = new Tween(0, tweenOptions);
	const timePriceTween = new Tween(0, tweenOptions);
	const totalPriceTween = new Tween(0, tweenOptions);
	const outwardKmTween = new Tween(0, tweenOptions);
	const returnKmTween = new Tween(0, tweenOptions);
	const outwardMinutesTween = new Tween(0, tweenOptions);
	const returnMinutesTween = new Tween(0, tweenOptions);

	// Update tweened values when actual values change
	$effect(() => {
		kmPriceTween.target = kmPrice;
		timePriceTween.target = timePrice;
		totalPriceTween.target = kmPrice + timePrice;
		outwardKmTween.target = outwardKm;
		returnKmTween.target = returnKm;
		outwardMinutesTween.target = outwardMinutes;
		returnMinutesTween.target = returnMinutes;
	});

	// Derived values for route calculations
	let outwardKm = $derived(routeDistance);
	let returnKm = $derived(returnRouteDistance);
	let totalKm = $derived(outwardKm + returnKm);

	let outwardMinutes = $derived(routeDuration);
	let returnMinutes = $derived(returnRouteDuration);
	let totalMinutes = $derived(outwardMinutes + returnMinutes + hoursAtDestination * 60);
	let totalHours = $derived(totalMinutes / 60);

	// Split total hours into day and night hours
	let dayHours = $derived(calculateDayHours());

	function calculateDayHours(): number {
		if (!startTime || !totalHours) return 0;
		const startDate = new Date();
		const parsedTime = parseTime(startTime);
		if (!parsedTime) return 0;

		startDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

		let currentTime = new Date(startDate);
		let dayHoursCount = 0;
		const endTime = new Date(startDate.getTime() + totalHours * 60 * 60 * 1000);

		while (currentTime < endTime) {
			const hour = currentTime.getHours();
			if (hour >= 8 && hour < 20) {
				dayHoursCount++;
			}
			currentTime.setHours(currentTime.getHours() + 1);
		}

		return dayHoursCount;
	}

	let nightHours = $derived(Math.ceil(totalHours - dayHours));

	// Derived values for pricing calculations
	let kmPrice = $derived.by(() => {
		const pricing = carClassPricing[selectedCar.carClass];
		return (
			Math.min(totalKm, 200) * pricing.upTo200km + Math.max(0, totalKm - 200) * pricing.above200km
		);
	});

	let timePrice = $derived(dayHours * 1.0 + nightHours * 0.2);

	let totalPrice = $derived(kmPrice + timePrice);

	// Map
	const INITIAL_CENTER: [number, number] = [11.583, 48.019];
	const OUTWARD = 'route-outward';
	const RETURN = 'route-return';

	let mapContainer: HTMLDivElement;
	let searchContainer: HTMLDivElement;
	let map = $state<mapboxgl.Map | null>(null); // set once the style has loaded
	let destinationMarker: mapboxgl.Marker | null = null;
	let searchBox: MapboxSearchBox | null = null;

	function toLngLat(car: Car): [number, number] {
		return [car.coordinates.lng, car.coordinates.lat];
	}

	onMount(() => {
		mapboxgl.accessToken = accessToken;
		const m = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/standard',
			center: INITIAL_CENTER,
			zoom: 13,
			language: 'de',
			config: { basemap: { show3dObjects: false } }
		});
		m.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
		m.on('style.load', () => {
			for (const [id, color] of [
				[OUTWARD, '#2563eb'],
				[RETURN, '#dc2626']
			]) {
				m.addSource(id, { type: 'geojson', data: lineString([]) });
				m.addLayer({
					id,
					type: 'line',
					source: id,
					slot: 'middle',
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: { 'line-color': color, 'line-width': 5, 'line-opacity': 0.9 }
				});
			}
			map = m;
		});
		m.on('click', (e) => setDestination(e.lngLat));

		const search = new MapboxSearchBox();
		search.accessToken = accessToken;
		search.placeholder = 'Adresse oder Ort';
		search.options = { language: 'de', country: 'DE' };
		search.theme = {
			variables: {
				colorBackground: 'rgba(0, 0, 0, 0.4)',
				colorBackgroundHover: 'rgba(255, 255, 255, 0.1)',
				colorBackgroundActive: 'rgba(255, 255, 255, 0.15)',
				colorText: '#ffffff',
				colorPrimary: '#facc15',
				colorSecondary: 'rgba(255, 255, 255, 0.7)',
				borderRadius: '0.5rem',
				boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
				border: '1px solid rgba(255, 255, 255, 0.2)'
			},
			cssText: `.Results { background: rgba(17, 24, 39, 0.95); backdrop-filter: blur(16px); }`
		};
		search.addEventListener('retrieve', (event) => {
			const feature = event.detail.features[0];
			if (!feature) return;
			const [lng, lat] = feature.geometry.coordinates;
			setDestination(new mapboxgl.LngLat(lng, lat), formatPlace(feature.properties));
		});
		searchContainer.append(search as unknown as Node);
		searchBox = search;

		return () => {
			m.remove();
			map = null;
		};
	});

	// Bias the search towards the selected car
	$effect(() => {
		if (searchBox) searchBox.options = { ...searchBox.options, proximity: toLngLat(selectedCar) };
	});

	// Recalculate when the car changes
	$effect(() => {
		if (currentDestination && selectedCar) {
			calculateAndDisplayRoute(currentDestination);
		}
	});

	// Tilt the map and show 3D buildings and terrain in 3D mode
	$effect(() => {
		if (!map) return;
		map.setConfigProperty('basemap', 'show3dObjects', is3D);
		map.easeTo({ pitch: is3D ? 60 : 0, duration: 800 });
	});

	/**
	 * Renders a Mapbox marker from the element's own markup. The click is handled
	 * natively because Svelte's delegated handlers run after the map has already
	 * seen the event and treated it as a map click.
	 */
	function marker(car: Car, m: mapboxgl.Map | null): Attachment {
		return (element) => {
			if (!m) return;
			const mk = new mapboxgl.Marker({ element: element as HTMLElement })
				.setLngLat(toLngLat(car))
				.addTo(m);
			element.setAttribute('aria-label', car.model);
			const select = (event: Event) => {
				event.stopPropagation();
				selectedCar = car;
			};
			element.addEventListener('click', select);
			return () => {
				element.removeEventListener('click', select);
				mk.remove();
			};
		};
	}

	function lineString(coordinates: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
		return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
	}

	interface PlaceProperties {
		name?: string;
		feature_type?: string;
		context?: { place?: { name?: string } };
	}

	function formatPlace(properties: PlaceProperties): string {
		const parts = [properties.name];
		const place = properties.context?.place?.name;
		if (place && place !== properties.name) parts.push(place);
		return parts.filter(Boolean).join(', ');
	}

	async function reverseGeocode(lngLat: mapboxgl.LngLat): Promise<string> {
		const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
		url.search = new URLSearchParams({
			longitude: String(lngLat.lng),
			latitude: String(lngLat.lat),
			language: 'de',
			types: 'address,street,place',
			limit: '1',
			access_token: accessToken
		}).toString();
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Reverse geocoding failed: ${response.status}`);
		const data: { features: { properties: PlaceProperties }[] } = await response.json();
		return data.features[0] ? formatPlace(data.features[0].properties) : '';
	}

	function setDestination(lngLat: mapboxgl.LngLat, name?: string) {
		currentDestination = lngLat;
		if (name !== undefined) placeName = name;
		else reverseGeocode(lngLat).then((n) => (placeName = n), console.error);
	}

	interface DirectionsLeg {
		distance: number; // m
		duration: number; // s
		steps: { geometry: { coordinates: [number, number][] } }[];
	}

	async function calculateAndDisplayRoute(destination: mapboxgl.LngLat) {
		if (!map) return;

		destinationMarker?.remove();
		destinationMarker = new mapboxgl.Marker({ color: '#dc2626' }).setLngLat(destination).addTo(map);

		// Round trip car → destination → car as two legs
		const origin = toLngLat(selectedCar);
		const coordinates = [origin, destination.toArray(), origin].map((c) => c.join(',')).join(';');
		const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`);
		url.search = new URLSearchParams({
			geometries: 'geojson',
			overview: 'full',
			steps: 'true',
			language: 'de',
			access_token: accessToken
		}).toString();

		try {
			const response = await fetch(url);
			const data: { code: string; message?: string; routes: { legs: DirectionsLeg[] }[] } =
				await response.json();
			const route = data.routes?.[0];
			if (data.code !== 'Ok' || route?.legs.length !== 2) {
				throw new Error(data.message ?? 'Invalid route response');
			}

			const [outwardLeg, returnLeg] = route.legs;
			const legPath = (leg: DirectionsLeg) => leg.steps.flatMap((step) => step.geometry.coordinates);
			const outwardPoints = legPath(outwardLeg);
			const returnPoints = legPath(returnLeg);

			routeDistance = outwardLeg.distance / 1000;
			routeDuration = outwardLeg.duration / 60;
			returnRouteDistance = returnLeg.distance / 1000;
			returnRouteDuration = returnLeg.duration / 60;
			detailsVisible = true;

			(map.getSource(OUTWARD) as mapboxgl.GeoJSONSource).setData(lineString(outwardPoints));
			(map.getSource(RETURN) as mapboxgl.GeoJSONSource).setData(lineString(returnPoints));

			const bounds = [...outwardPoints, ...returnPoints].reduce(
				(b, point) => b.extend(point),
				new mapboxgl.LngLatBounds(origin, origin)
			);
			// Keep the route clear of the panels, which sit left and right of the map on wide screens
			const wide = window.matchMedia('(min-width: 768px)').matches;
			map.fitBounds(bounds, {
				padding: wide ? { top: 60, bottom: 60, left: 530, right: 360 } : 50,
				duration: 1000
			});
		} catch (error) {
			console.error('Route calculation failed:', error);
		}
	}
</script>

<div class="relative h-full w-full overflow-hidden dark">
	<div bind:this={mapContainer} class="h-full w-full absolute inset-0 z-0"></div>

	<!-- Car markers: the elements are moved onto the map once it is ready -->
	<div class="hidden">
		{#each cars as car (car.model)}
			<button
				type="button"
				class="cursor-pointer rounded-full"
				title={car.model}
				{@attach marker(car, map)}
			>
				<Avatar
					src={car.imageURL}
					size="md"
					border
					class={car.model == selectedCar.model ? 'ring-yellow-400 dark:ring-yellow-300' : ''}
				></Avatar>
			</button>
		{/each}
	</div>

	<div class="absolute inset-0 z-10 p-4 space-y-4 md:p-0 pointer-events-none overflow-y-auto">
		<div class="md:absolute md:left-4 md:top-4 w-full md:w-[490px] pointer-events-auto">
			<Accordion
				class="bg-black/60 backdrop-blur-lg rounded-2xl outline-2 outline-white shadow-2xl"
				flush
			>
				<AccordionItem
					open
					class="rounded-2xl"
					classes={{
						button: 'bg-yellow-400/30 px-4 py-3 outline-2 rounded-t-xl',
						content: 'border-0 p-4'
					}}
				>
					{#snippet header()}
						<div class="text-white font-medium">Fahrt planen</div>
					{/snippet}
					<div class="flex flex-col space-y-2">
						<div class="text-sm font-medium text-white/90">Wähle dein Fahrzeug:</div>

						<!-- Mobile: Dropdown -->
						<div class="md:hidden">
							<Button
								class="w-full bg-black/30 border-white/20 hover:bg-white/10 text-white cursor-pointer"
							>
								{selectedCar.model}
								<Badge
									color="dark"
									class="bg-black/60 backdrop-blur-sm text-white border border-white/20 text-xs mx-2"
								>
									{selectedCar.carClass}
								</Badge>
								<ChevronDownOutline class="ms-2 h-4 w-4" />
							</Button>
							<Dropdown
								bind:isOpen={isDropdownOpen}
								class="w-[95%] max-h-96 overflow-y-auto py-1 bg-gray-800 border-white/20"
							>
								{#each cars as car (car.model)}
									<DropdownItem
										class="flex items-center gap-3 text-base hover:bg-white/10 cursor-pointer {selectedCar.model ===
										car.model
											? 'bg-yellow-400/20'
											: ''}"
										onclick={() => {
											selectedCar = car;
											isDropdownOpen = false;
										}}
									>
										<Avatar
											src={car.imageURL}
											size="sm"
											class="ring-2 {selectedCar.model === car.model
												? 'ring-yellow-400'
												: 'ring-white/20'}"
										/>
										<div class="flex flex-col">
											<span class="font-semibold text-white">{car.model}</span>
											<div class="flex items-center gap-2 text-xs text-gray-300">
												<Badge
													color="dark"
													class="bg-black/60 backdrop-blur-sm text-white border border-white/20 text-xs"
												>
													{car.carClass}
												</Badge>
												<span class="flex items-center gap-1">
													<MapPinAltSolid class="h-3 w-3" />
													{car.address}
												</span>
											</div>
										</div>
									</DropdownItem>
								{/each}
							</Dropdown>
						</div>

						<!-- Desktop: Cards -->
						<div class="relative hidden md:block">
							<div class="grid grid-cols-2 gap-2">
								{#each cars as car (car.model)}
									<button
										class="cursor-pointer group flex flex-col rounded-xl border-2 transition-all hover:scale-100 hover:shadow-lg {selectedCar.model ===
										car.model
											? 'border-yellow-400 bg-white/10 shadow-2xl shadow-yellow-400/20'
											: 'border-white/20 bg-black/30 hover:border-white/40'}"
										onclick={() => (selectedCar = car)}
									>
										<div class="relative w-full h-36 overflow-hidden rounded-xl">
											<img
												src={car.imageURL}
												alt={car.model}
												class="w-full h-full object-cover transition-transform group-hover:scale-105"
											/>
											<div
												class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
											></div>
											<div class="absolute top-2 right-2">
												<Badge
													color="dark"
													class="bg-black/60 backdrop-blur-sm text-white border border-white/20"
												>
													{car.carClass}
												</Badge>
											</div>
											<div class="absolute bottom-0 left-0 right-0 p-2 space-y-0.5">
												<div class="font-medium text-white">{car.model}</div>
												<div class="text-xs text-gray-300 flex items-center justify-center gap-1">
													<MapPinAltSolid class="h-3 w-3" />
													{car.address}
												</div>
											</div>
										</div>
									</button>
								{/each}
							</div>
						</div>

						<div class="text-sm font-medium text-white/90">Ziel eingeben:</div>
						<div bind:this={searchContainer} class="rounded-lg shadow-xl"></div>
					</div>

					<div class="flex justify-end items-center gap-2 mt-2">
						<Badge color="dark" class="text-sm text-white/90">2D</Badge>
						<Toggle bind:checked={is3D} />
						<Badge color="dark" class="text-sm text-white/90 -ml-3">3D</Badge>
					</div>
				</AccordionItem>
			</Accordion>
		</div>

		{#if detailsVisible}
			<div
				transition:fly={{ x: 300, duration: 500, opacity: 1 }}
				class="w-full md:w-[320px] md:absolute md:right-4 md:top-4 pointer-events-auto"
			>
				<Accordion
					class="bg-black/60 backdrop-blur-lg rounded-2xl outline-2 outline-white shadow-2xl"
					flush
				>
					<AccordionItem
						open
						class="rounded-2xl"
						classes={{
							button: 'bg-yellow-400/30 px-4 py-3 outline-2 rounded-t-xl',
							content: 'border-0 p-4'
						}}
					>
						{#snippet header()}
							<div class="text-white font-medium">Fahrtdetails</div>
						{/snippet}
						<div class="space-y-2">
							<div class="flex items-center gap-3 bg-white/10 rounded-lg p-2.5 shadow-inner">
								<input
									type="time"
									bind:value={startTime}
									class="flex-1 px-3 py-2 text-sm bg-black/30 text-white rounded border border-white/20 focus:outline-none focus:border-yellow-400/50 transition-colors"
								/>
								<span class="text-sm text-white/90">Startzeit</span>
							</div>

							<div class="border-t border-white/10 pt-3">
								<div class="font-medium mb-2 text-blue-100">Hinfahrt</div>
								<div class="grid grid-cols-2 gap-2 text-sm text-white/90">
									{#if routeDistance}<div>
											Entfernung: <span class="font-medium">
												{formatDistance(outwardKmTween.current)}
											</span>
										</div>{/if}
									{#if routeDuration}<div>
											Dauer: <span class="font-medium">
												{Math.round(outwardMinutesTween.current)} min
											</span>
										</div>{/if}
								</div>
							</div>

							<div class="border-t border-white/10 pt-3">
								<div class="font-medium mb-2 text-blue-100 truncate">
									Zeit {placeName ? 'in ' + placeName : 'am Zielort'}
								</div>
								<div class="flex items-center gap-3 bg-white/10 rounded-lg p-2.5 shadow-inner">
									<input
										type="number"
										min="0"
										step="0.5"
										bind:value={hoursAtDestination}
										class="flex-1 px-3 py-2 text-sm bg-black/30 text-white rounded border border-white/20 focus:outline-none focus:border-yellow-400/50 transition-colors"
									/>
									<span class="text-sm text-white/90">Stunden</span>
								</div>
							</div>

							<div class="border-t border-white/10 pt-3">
								<div class="font-medium mb-2 text-blue-100">Rückfahrt</div>
								<div class="grid grid-cols-2 gap-2 text-sm text-white/90">
									{#if returnRouteDistance}<div>
											Entfernung: <span class="font-medium"
												>{formatDistance(returnKmTween.current)}</span
											>
										</div>{/if}
									{#if returnRouteDuration}<div>
											Dauer: <span class="font-medium"
												>{Math.round(returnMinutesTween.current)} min</span
											>
										</div>{/if}
								</div>
							</div>

							{#if totalPrice}
								<div class="border-t border-white/10 pt-3">
									<div class="font-medium mb-2 text-blue-100">Kostenberechnung</div>
									<div class="space-y-2">
										{#if kmPrice}
											<div class="bg-white/10 rounded-lg p-3 shadow-inner">
												<div class="text-xs text-white/80">
													Kilometerkosten ({formatDistance(totalKm)})
												</div>
												<div class="text-lg font-medium text-white/80">
													{formatPrice(kmPriceTween.current)}
												</div>
											</div>
										{/if}

										{#if timePrice}
											<div class="bg-white/10 rounded-lg p-3 shadow-inner">
												<div class="text-xs text-white/80">
													Zeitkosten ({dayHours} h ☀️ + {nightHours} h 🌙)
												</div>
												<div class="text-lg font-medium text-white/80">
													{formatPrice(timePriceTween.current)}
												</div>
											</div>
										{/if}

										{#if totalPrice}
											<div class="bg-yellow-400/30 rounded-lg p-4 mt-3 shadow-lg">
												<div class="text-xs text-white/90">Gesamtkosten</div>
												<div class="text-2xl font-medium text-white mt-0.5">
													{formatPrice(totalPriceTween.current)}
												</div>
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</AccordionItem>
				</Accordion>
			</div>
		{/if}
	</div>
</div>
