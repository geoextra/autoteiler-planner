<script lang="ts">
	import { PUBLIC_GOOGLE_MAPS_API_KEY } from '$env/static/public';
	import { Loader } from '@googlemaps/js-api-loader';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { MapPinAltSolid } from 'flowbite-svelte-icons';
	import { AccordionItem, Accordion } from 'flowbite-svelte';

	interface Car {
		model: string;
		address: string;
		imageURL: string;
		coordinates: google.maps.LatLngLiteral;
	}

	const cars: Car[] = [
		{
			model: 'Dacia Jogger',
			address: 'Hinteres Gleißental 19, Oberhaching',
			imageURL:
				'https://www.autoteiler-oberhaching.de/wp-content/uploads/go-x/u/5b971129-3306-45bb-8827-11d926a8945a/l0,t0,w1280,h960/image-683x512.jpg',
			coordinates: { lat: 48.0148737, lng: 11.5886307 }
		},
		{
			model: 'Toyota Proace City',
			address: 'Hubertusstr. 11, Oberhaching',
			imageURL:
				'https://www.autoteiler-oberhaching.de/wp-content/uploads/go-x/u/03241f99-6f5c-4709-978c-66d34f8fd594/l0,t0,w600,h450/image.jpg',
			coordinates: { lat: 48.0200973, lng: 11.5848989 }
		},
		{
			model: 'Skoda Fabia',
			address: 'Bürgersaal beim Forstner, Kybergstraße 2, Oberhaching',
			imageURL:
				'https://www.autoteiler-oberhaching.de/wp-content/uploads/go-x/u/bc468627-94bc-46cb-aaa8-81e7f270a95a/l37,t0,w580,h463/image-480x383.jpg',
			coordinates: { lat: 48.0257354, lng: 11.5950084 }
		},
		{
			model: 'Toyota Aygo X',
			address: 'Laufzorner Str. 11, Oberhaching',
			imageURL:
				'https://www.autoteiler-oberhaching.de/wp-content/uploads/go-x/u/45205f0e-6a98-44cf-9741-2091dce570b6/l23,t197,w545,h409/image.jpg',
			coordinates: { lat: 48.0221586, lng: 11.5768658 }
		}
	];

	let selectedCar = $state(cars[0]);

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
	let kmPrice = $derived(Math.min(totalKm, 200) * 0.35 + Math.max(0, totalKm - 200) * 0.25);

	let timePrice = $derived(dayHours * 1.0 + nightHours * 0.2);

	let totalPrice = $derived(kmPrice + timePrice);

	let map: google.maps.maps3d.Map3DElement;
	let placeAutocomplete: google.maps.places.PlaceAutocompleteElement;
	let destinationMarker: google.maps.marker.AdvancedMarkerElement | null = null;

	let currentRoute: Iterable<google.maps.LatLngLiteral> | null = $state(null);
	let currentReturnRoute: Iterable<google.maps.LatLngLiteral> | null = $state(null);

	onMount(async () => {
		const libraries = ['marker', 'places', 'maps3d'];
		const loader = new Loader({
			apiKey: PUBLIC_GOOGLE_MAPS_API_KEY,
			version: 'beta',
			language: 'de',
			region: 'DE',
			//@ts-expect-error maps3d not yet included in the types
			libraries
		});

		// import required libraries
		//@ts-expect-error maps3d not yet included in the types
		await Promise.all(libraries.map((lib) => loader.importLibrary(lib)));

		initMap();
	});

	// Watch for car selection changes
	$effect(() => {
		if (currentDestination && selectedCar) {
			calculateAndDisplayRoute(currentDestination);
		}
	});

	function initMap() {
		cars.forEach((car) => {
			const carPinElement = new google.maps.marker.PinElement({
				background: 'white',
				borderColor: '#fff200',
				glyph: '🚖',
				scale: 1.5
			});
			//@ts-expect-error maps3d not yet included in the types
			const carMarker = new google.maps.maps3d.Marker3DInteractiveElement({
				position: { lat: car.coordinates.lat, lng: car.coordinates.lng, altitude: 25 },
				altitudeMode: 'RELATIVE_TO_MESH',
				extruded: true,
				label: car.model
			});
			carMarker.append(carPinElement);
			carMarker.addEventListener('gmp-click', (event: google.maps.maps3d.LocationClickEvent) => {
				const originalCamera = {
					center: { lat: car.coordinates.lat, lng: car.coordinates.lng, altitude: 100 },
					altitudeMode: 'RELATIVE_TO_MESH',
					range: 700,
					tilt: 74,
					heading: 0
				};
				/* map.flyCameraAround({
					camera: originalCamera,
					durationMillis: 50000,
					rounds: 1
				}); */
				selectedCar = car;
			});

			map.append(carMarker);
		});

		map.addEventListener('gmp-click', async (event: any) => {
			event.preventDefault();
			if (event.position) {
				const clickedPosition = new google.maps.LatLng(event.position.lat, event.position.lng);
				calculateAndDisplayRoute(clickedPosition);
				currentDestination = clickedPosition;
			}
		});
	}

	async function calculateAndDisplayRoute(destination: google.maps.LatLng) {
		const directionsService = new google.maps.DirectionsService();
		const geocoder = new google.maps.Geocoder();

		// Get place name from coordinates
		try {
			const response = await geocoder.geocode({ location: destination });
			if (response.results[0]) {
				placeName = response.results[0].formatted_address;
			}
		} catch (error) {
			console.error('Geocoding failed:', error);
		}

		// Remove existing destination marker if it exists
		if (destinationMarker && map.contains(destinationMarker)) {
			destinationMarker.remove();
			destinationMarker = null;
		}

		// Create new destination marker
		const destinationPinElement = new google.maps.marker.PinElement({
			background: 'white',
			borderColor: 'red',
			glyph: '📍',
			scale: 1.5
		});
		//@ts-expect-error maps3d not yet included in the types
		const newMarker = new google.maps.maps3d.Marker3DInteractiveElement({
			position: destination,
			extruded: true,
			label: 'Zielort'
		});
		newMarker.append(destinationPinElement);
		map.append(newMarker);
		destinationMarker = newMarker;

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

			// Calculate center and range for the camera
			const center = bounds.getCenter();
			const range = Math.max(
				google.maps.geometry.spherical.computeDistanceBetween(
					bounds.getNorthEast(),
					bounds.getCenter()
				) * 2,
				2000 // Minimum range in meters
			);
			//@ts-expect-error maps3d not yet included in the types
			map.flyCameraTo({
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
		} catch (error) {
			console.error('Route calculation failed:', error);
			throw error;
		}
	}

	async function onAutocompleteSelect({ placePrediction }: { placePrediction: any }) {
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
	<gmp-map-3d
		id="map"
		bind:this={map}
		center={{ lat: 48.019, lng: 11.583, altitude: 3500 }}
		tilt={0}
		mode="HYBRID"
		class="h-full w-full fixed inset-0"
	>
		{#if currentRoute && currentRoute.length > 0}
			<gmp-polyline-3d
				coordinates={currentRoute}
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
				coordinates={currentReturnRoute}
				strokeColor="red"
				outerColor="white"
				strokeWidth={10}
				outerWidth={0.4}
				altitudeMode="CLAMP_TO_GROUND"
				drawsOccludedSegments={true}
			></gmp-polyline-3d>
		{/if}
	</gmp-map-3d>

	<div class="relative z-10 p-4 space-y-4 md:p-0">
		<div class="md:absolute md:left-4 md:top-4 w-full md:w-[490px]">
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
						<label class="text-sm font-medium text-white/90">Wähle dein Fahrzeug:</label>
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

						<label class="text-sm font-medium text-white/90">Ziel eingeben:</label>
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
				</AccordionItem>
			</Accordion>
		</div>

		{#if detailsVisible}
			<div
				transition:fly={{ x: 300, duration: 500, opacity: 1 }}
				class="w-full md:w-[320px] md:absolute md:right-4 md:top-4"
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
