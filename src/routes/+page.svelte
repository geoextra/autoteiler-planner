<script lang="ts">
	import { PUBLIC_GOOGLE_MAPS_API_KEY } from '$env/static/public';
	import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { MapPinAltSolid } from 'flowbite-svelte-icons';
	import { AccordionItem, Accordion, Badge, Toggle, Avatar } from 'flowbite-svelte';

	enum CarClass {
		Small = 'Klein',
		Compact = 'Kompakt',
		Medium = 'Mittel'
	}

	interface CarClassPricing {
		upTo200km: number;
		above200km: number;
	}

	const carClassPricing: Record<CarClass, CarClassPricing> = {
		[CarClass.Small]: {
			upTo200km: 0.3,
			above200km: 0.2
		},
		[CarClass.Compact]: {
			upTo200km: 0.35,
			above200km: 0.25
		},
		[CarClass.Medium]: {
			upTo200km: 0.4,
			above200km: 0.3
		}
	};

	interface Car {
		model: string;
		address: string;
		imageURL: string;
		coordinates: google.maps.LatLngLiteral;
		carClass: CarClass;
	}

	const cars: Car[] = [
		{
			model: 'Dacia Jogger',
			address: 'Hinteres Gleißental 19, Oberhaching',
			imageURL: 'https://www.autoteiler-oberhaching.de/wp-content/uploads/2025/08/image-9.avif',
			coordinates: { lat: 48.0148737, lng: 11.5886307 },
			carClass: CarClass.Medium
		},
		{
			model: 'Toyota Proace City',
			address: 'Hubertusstr. 11, Oberhaching',
			imageURL: 'https://www.autoteiler-oberhaching.de/wp-content/uploads/2025/08/image-4.avif',
			coordinates: { lat: 48.0200973, lng: 11.5848989 },
			carClass: CarClass.Medium
		},
		{
			model: 'Skoda Fabia',
			address: 'Bürgersaal beim Forstner, Kybergstraße 2, Oberhaching',
			imageURL: 'https://www.autoteiler-oberhaching.de/wp-content/uploads/2025/09/image-12.avif',
			coordinates: { lat: 48.0257354, lng: 11.5950084 },
			carClass: CarClass.Compact
		},
		{
			model: 'Toyota Aygo X',
			address: 'Laufzorner Str. 11, Oberhaching',
			imageURL: 'https://www.autoteiler-oberhaching.de/wp-content/uploads/2025/08/image-6.avif',
			coordinates: { lat: 48.0221586, lng: 11.5768658 },
			carClass: CarClass.Small
		}
	];

	let selectedCar = $state(cars[0]);

	// Map mode state (2D default for performance)
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
		try {
			const [hours, minutes] = timeString.split(':').map(Number);
			if (isNaN(hours) || isNaN(minutes)) return null;
			return { hours, minutes };
		} catch (error) {
			console.error('Error parsing time:', error);
			return null;
		}
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
	let currentDestination = $state<google.maps.LatLng | null>(null);

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

	// 3D map refs
	let map3d = $state<google.maps.maps3d.Map3DElement | null>(null);
	let placeAutocomplete: google.maps.places.PlaceAutocompleteElement;
	let destinationMarker3D: google.maps.marker.AdvancedMarkerElement | null = null;

	// 2D map refs (using gmp-map web component)
	let map2d: google.maps.Map | null = null;
	let map2dEl = null;
	let outwardPolyline2D: google.maps.Polyline | null = null;
	let returnPolyline2D: google.maps.Polyline | null = null;

	// Shared route point type (2D ignores altitude, 3D can use it)
	type RoutePoint = google.maps.LatLngLiteral & { altitude?: number };
	let currentRoute: RoutePoint[] | null = $state(null);
	let currentReturnRoute: RoutePoint[] | null = $state(null);

	let maps3dLoaded = $state(false);

	// Set Google Maps options once at module initialization
	setOptions({ key: PUBLIC_GOOGLE_MAPS_API_KEY, language: 'de', region: 'DE' });

	onMount(async () => {
		// Import required libraries for 2D map
		await Promise.all([importLibrary('maps'), importLibrary('marker'), importLibrary('places')]);

		await initMap2D();
	});

	// Watch for car selection changes
	$effect(() => {
		if (currentDestination && selectedCar) {
			calculateAndDisplayRoute(currentDestination);
		}
	});

	// Watch for map mode changes and (lazy) init 3D
	$effect(async () => {
		if (is3D && !maps3dLoaded) {
			// Load maps3d library only when needed
			await importLibrary('maps3d');
			maps3dLoaded = true;
			await initMap3D();
		}
		// Redraw route in the active mode if we already have a destination
		if (currentDestination) {
			calculateAndDisplayRoute(currentDestination);
		}
	});

	// Ensure 2D map initializes when switching back from 3D
	$effect(() => {
		if (!is3D && map2dEl && !map2d) {
			initMap2D();
		}
	});

	// If the 3D DOM element binds after libs loaded, initialize markers and events
	$effect(() => {
		if (is3D && maps3dLoaded && map3d) {
			initMap3D();
		}
	});

	async function initMap3D() {
		if (!map3d) return;

		// Import marker library if not already loaded
		const { PinElement } = await importLibrary('marker');
		// Import maps3d library if not already loaded
		const { Marker3DInteractiveElement } = await importLibrary('maps3d');

		// Add car markers
		cars.forEach((car) => {
			const carPinElement = new PinElement({
				background: 'white',
				borderColor: '#fff200',
				glyphText: '🚖',
				scale: 1.5
			});

			//@ts-expect-error maps3d not yet included in the types
			const carMarker = new Marker3DInteractiveElement({
				position: { lat: car.coordinates.lat, lng: car.coordinates.lng, altitude: 25 },
				altitudeMode: 'RELATIVE_TO_MESH',
				extruded: true,
				label: car.model
			});
			carMarker.append(carPinElement);
			carMarker.addEventListener('gmp-click', (event: google.maps.maps3d.LocationClickEvent) => {
				selectedCar = car;
			});

			map3d.append(carMarker);
		});

		// Add click listener for destination selection
		map3d.addEventListener('gmp-click', async (event) => {
			event.preventDefault();
			if (event.position) {
				const clickedPosition = new google.maps.LatLng(event.position.lat, event.position.lng);
				calculateAndDisplayRoute(clickedPosition);
				currentDestination = clickedPosition;
			}
		});
	}

	async function initMap2D() {
		if (!map2dEl) return;

		// Wait for the gmp-map web component to be ready
		await customElements.whenDefined('gmp-map');

		// Get the inner Map instance from the web component
		map2d = (map2dEl as any).innerMap || (map2dEl as any).map || null;
		if (!map2d) {
			console.error('Failed to get Map instance from gmp-map element');
			return;
		}

		// Add click listener to set destination
		map2d.addListener('click', (e: google.maps.MapMouseEvent) => {
			if (!e.latLng) return;
			calculateAndDisplayRoute(e.latLng);
			currentDestination = e.latLng;
		});
	}

	async function calculateAndDisplayRoute(destination: google.maps.LatLng) {
		// Import routes library for directions
		const { DirectionsService } = await importLibrary('routes');
		// Import geocoding library
		const { Geocoder } = await importLibrary('geocoding');

		const directionsService = new DirectionsService();
		const geocoder = new Geocoder();

		// Get place name from coordinates
		try {
			const response = await geocoder.geocode({ location: destination });
			if (response.results[0]) {
				placeName = response.results[0].formatted_address;
			}
		} catch (error) {
			console.error('Geocoding failed:', error);
		}

		// Remove and create destination marker depending on mode
		if (is3D) {
			// Import required libraries for 3D marker
			const { PinElement } = await importLibrary('marker');
			const { Marker3DInteractiveElement } = await importLibrary('maps3d');

			if (destinationMarker3D && map3d.contains(destinationMarker3D)) {
				destinationMarker3D.remove();
				destinationMarker3D = null;
			}

			const destinationPinElement = new PinElement({
				background: 'white',
				borderColor: 'red',
				glyphText: '📍',
				scale: 1.5
			});

			//@ts-expect-error maps3d not yet included in the types
			const newMarker = new Marker3DInteractiveElement({
				position: destination,
				extruded: true,
				label: 'Zielort'
			});
			newMarker.append(destinationPinElement);
			map3d.append(newMarker);
			destinationMarker3D = newMarker as unknown as google.maps.marker.AdvancedMarkerElement;
		} else {
			// Destination marker in 2D is rendered declaratively in the template based on currentDestination
		}

		// Get departure date based on start time
		const getDepartureDate = () => {
			const selectedDate = new Date();
			const parsedTime = parseTime(startTime);
			if (parsedTime) selectedDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
			selectedDate.setDate(selectedDate.getDate() + 7);
			return selectedDate;
		};

		// Calculate route with waypoint
		try {
			const origin = new google.maps.LatLng(
				selectedCar.coordinates.lat,
				selectedCar.coordinates.lng
			);
			const response = await directionsService.route({
				origin: origin,
				destination: origin,
				waypoints: [
					{
						location: destination,
						stopover: true
					}
				],
				travelMode: google.maps.TravelMode.DRIVING,
				drivingOptions: {
					departureTime: getDepartureDate()
				}
			});

			const route = response.routes[0];
			if (!route || route.legs?.length !== 2) {
				throw new Error('Invalid route response');
			}

			// First leg is outward journey
			const outwardLeg = route.legs[0];
			const outwardPoints = route.overview_path.slice(
				0,
				Math.floor(route.overview_path.length / 2)
			);
			routeDistance = (outwardLeg.distance?.value ?? 0) / 1000;
			routeDuration = (outwardLeg.duration?.value ?? 0) / 60;

			// Second leg is return journey
			const returnLeg = route.legs[1];
			const returnPoints = route.overview_path.slice(Math.floor(route.overview_path.length / 2));
			returnRouteDistance = (returnLeg.distance?.value ?? 0) / 1000;
			returnRouteDuration = (returnLeg.duration?.value ?? 0) / 60;

			detailsVisible = true;

			// Draw route overlays depending on mode
			if (is3D) {
				currentRoute = outwardPoints.map((point) => ({
					lat: point.lat(),
					lng: point.lng()
				}));

				currentReturnRoute = returnPoints.map((point) => ({
					lat: point.lat(),
					lng: point.lng(),
					altitude: 0.1
				}));

				const bounds: google.maps.LatLngBounds = route.bounds;
				const center = bounds.getCenter();
				const range = Math.max(
					google.maps.geometry.spherical.computeDistanceBetween(
						bounds.getNorthEast(),
						bounds.getCenter()
					) * 2,
					2000
				);
				map3d.flyCameraTo({
					endCamera: {
						center: {
							lat: center.lat(),
							lng: center.lng(),
							altitude: range * 0.9
						},
						range: range,
						tilt: 0,
						heading: 0
					},
					durationMillis: 1000
				});
			} else {
				// Import maps library for Polyline
				const { Polyline } = await importLibrary('maps');

				// Clean previous polylines
				outwardPolyline2D?.setMap(null);
				returnPolyline2D?.setMap(null);

				outwardPolyline2D = new Polyline({
					map: map2d!,
					path: outwardPoints,
					strokeColor: 'blue',
					strokeWeight: 5,
					strokeOpacity: 0.9
				});
				returnPolyline2D = new Polyline({
					map: map2d!,
					path: returnPoints,
					strokeColor: 'red',
					strokeWeight: 5,
					strokeOpacity: 0.9
				});

				// Fit bounds on 2D map
				const bounds = route.bounds;
				if (bounds && map2d) {
					map2d.fitBounds(bounds, 50);
				}
			}
		} catch (error) {
			console.error('Route calculation failed:', error);
			throw error;
		}
	}

	async function onAutocompleteSelect({ placePrediction }: { placePrediction }) {
		const place = placePrediction.toPlace();
		await place.fetchFields({ fields: ['displayName', 'location'] });

		const placeLocation = new google.maps.LatLng(place.location.lat(), place.location.lng());
		calculateAndDisplayRoute(placeLocation);
		currentDestination = placeLocation;
	}

	function applyAutocompleteShadowStyles(element: Element) {
		const shadow = element.shadowRoot;
		if (!shadow) return;

		// Remove existing style if present
		const existingStyle = shadow.querySelector('style');
		if (existingStyle) {
			existingStyle.remove();
		}

		const style = document.createElement('style');
		style.textContent = `
			.widget-container {
				border: none !important;
			}
			.focus-ring {
				display: none !important;
			}
			.attributions {
				display: none !important;
			}
		`;

		shadow.appendChild(style);
	}

	// style the autocomplete input
	const attachShadow = Element.prototype.attachShadow;
	Element.prototype.attachShadow = function (init: ShadowRootInit) {
		// Check if we are the new Google places autocomplete element...
		if (this.localName === 'gmp-place-autocomplete') {
			// If we are, we need to override the default behaviour of attachShadow() to
			// set the mode to open to allow us to crowbar a style element into the shadow DOM.
			const shadow = attachShadow.call(this, {
				...init,
				mode: 'open'
			});

			applyAutocompleteShadowStyles(this);

			// Set the shadowRoot property to the new shadow root that has our styles in it.
			return shadow;
		}
		// ...for other elements, proceed with the original behaviour of attachShadow().
		return attachShadow.call(this, init);
	};

	// Watch for visibility changes
	$effect(() => {
		if (placeAutocomplete) {
			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
						applyAutocompleteShadowStyles(placeAutocomplete);
					}
				});
			});

			observer.observe(placeAutocomplete, {
				attributes: true,
				attributeFilter: ['style']
			});

			// Initial application of styles
			applyAutocompleteShadowStyles(placeAutocomplete);
		}
	});
</script>

<svelte:head>
	<title>Autoteiler Planer</title>
</svelte:head>

<div class="h-screen w-full dark">
	{#if is3D}
		<gmp-map-3d
			id="map3d"
			bind:this={map3d}
			center={{ lat: 48.019, lng: 11.583, altitude: 3500 }}
			tilt={0}
			mode="HYBRID"
			class="h-full w-full fixed inset-0 z-0"
		>
			{#if currentRoute && currentRoute.length > 0}
				<gmp-polyline-3d
					path={currentRoute}
					strokeColor="blue"
					outerColor="white"
					strokeWidth={10}
					outerWidth={0.4}
					altitudeMode="CLAMP_TO_GROUND"
					drawsOccludedSegments={true}
				></gmp-polyline-3d>
			{/if}
			{#if currentReturnRoute && currentReturnRoute.length > 0}
				<gmp-polyline-3d
					path={currentReturnRoute}
					strokeColor="red"
					outerColor="white"
					strokeWidth={10}
					outerWidth={0.4}
					altitudeMode="CLAMP_TO_GROUND"
					drawsOccludedSegments={true}
				></gmp-polyline-3d>
			{/if}
		</gmp-map-3d>
	{:else}
		<gmp-map
			id="map2d"
			bind:this={map2dEl}
			map-id="DEMO_MAP_ID"
			center={{ lat: 48.019, lng: 11.583 }}
			zoom={13}
			class="h-full w-full fixed inset-0 z-0"
		>
			{#each cars as car (car.model)}
				<gmp-advanced-marker
					gmp-clickable
					position={car.coordinates}
					title={car.model}
					ongmp-click={() => (selectedCar = car)}
				>
					<Avatar
						src={car.imageURL}
						size="md"
						border
						class={car.model == selectedCar.model ? 'ring-yellow-400 dark:ring-yellow-300' : ''}
					></Avatar>
				</gmp-advanced-marker>
			{/each}
			{#if currentDestination}
				<gmp-advanced-marker gmp-clickable position={currentDestination} title="Zielort">
				</gmp-advanced-marker>
			{/if}
		</gmp-map>
	{/if}

	<div class="fixed inset-0 z-10 p-4 space-y-4 md:p-0 pointer-events-none">
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
						<div class="relative">
							<div class="grid grid-cols-2 gap-3">
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
						<gmp-place-autocomplete
							id="place-autocomplete-input"
							bind:this={placeAutocomplete}
							ongmp-select={onAutocompleteSelect}
							requestedLanguage="de"
							requestedRegion="de"
							locationBias={selectedCar.coordinates}
							unit-system="metric"
							class="rounded-lg shadow-xl"
						></gmp-place-autocomplete>
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
