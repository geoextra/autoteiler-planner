<script lang="ts">
	import { PUBLIC_GOOGLE_MAPS_API_KEY } from '$env/static/public';
	import { Loader } from '@googlemaps/js-api-loader';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { ChevronRightOutline, MapPinAltSolid, SearchOutline } from 'flowbite-svelte-icons';

	// Helper functions
	function formatDistance(km: number): string {
		return `${km.toFixed(1).replace('.', ',')} km`;
	}

	function formatPrice(price: number): string {
		return `${price.toFixed(2).replace('.', ',')} €`;
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
	let selectedCarIndex = $state(0);
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
		kmPriceTween.target = kmPriceValue;
		timePriceTween.target = timePriceValue;
		totalPriceTween.target = kmPriceValue + timePriceValue;
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

	let totalDuration = $derived(`${totalMinutes} min total`);

	// Derived values for pricing calculations
	let kmPriceValue = $derived(
		totalKm ? Math.min(totalKm, 200) * 0.35 + Math.max(0, totalKm - 200) * 0.25 : 0
	);

	let kmPrice = $derived(`${kmPriceValue.toFixed(2)} €`);

	let timePriceValue = $derived(
		startTime && totalHours
			? (() => {
					const startDate = new Date();
					const [hours, minutes] = startTime.split(':').map(Number);
					startDate.setHours(hours, minutes, 0, 0);

					let currentTime = new Date(startDate);
					let totalTimePrice = 0;
					const endTime = new Date(startDate.getTime() + totalHours * 60 * 60 * 1000);

					while (currentTime < endTime) {
						const hour = currentTime.getHours();
						totalTimePrice += hour >= 8 && hour < 20 ? 1.0 : 0.2;
						currentTime.setHours(currentTime.getHours() + 1);
					}

					return totalTimePrice;
				})()
			: 0
	);

	let timePrice = $derived(`${timePriceValue.toFixed(2)} €`);
	let totalPrice = $derived(`${(kmPriceValue + timePriceValue).toFixed(2)} €`);

	let map: google.maps.maps3d.Map3DElement;
	let placeAutocomplete: google.maps.places.PlaceAutocompleteElement;
	let currentRoutePolyline: google.maps.maps3d.Polyline3DElement | null = null;
	let returnRoutePolyline: google.maps.maps3d.Polyline3DElement | null = null;
	let destinationMarker: google.maps.marker.AdvancedMarkerElement | null = null;

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
			model: 'Fiat Punto',
			address: 'Josefstr. 45, Oberhaching',
			imageURL:
				'https://www.autoteiler-oberhaching.de/wp-content/uploads/go-x/u/58f1b4dd-cf7a-4f79-89e3-bff9aadcf36d/l160,t0,w480,h360/image.jpg',
			coordinates: { lat: 48.0138089, lng: 11.5905707 }
		},
		{
			model: 'Toyota Aygo X',
			address: 'Laufzorner Str. 11, Oberhaching',
			imageURL:
				'https://www.autoteiler-oberhaching.de/wp-content/uploads/go-x/u/45205f0e-6a98-44cf-9741-2091dce570b6/l23,t197,w545,h409/image.jpg',
			coordinates: { lat: 48.0221586, lng: 11.5768658 }
		}
	];

	let selectedCar = $derived(cars[selectedCarIndex]);

	onMount(async () => {
		const loader = new Loader({
			apiKey: PUBLIC_GOOGLE_MAPS_API_KEY,
			version: 'beta',
			//@ts-ignore
			libraries: ['maps', 'marker', 'places', 'maps3d']
		});

		// Load required libraries
		await loader.load();

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
				glyph: '🚖'
				// glyph: new URL(car.imageURL)
			});
			//@ts-ignore
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
				selectedCarIndex = cars.findIndex((c) => c.model === car.model);
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
			glyph: '📍'
		});
		//@ts-ignore
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
			const now = new Date();
			const [hours, minutes] = startTime.split(':').map(Number);
			const selectedDate = new Date();
			selectedDate.setHours(hours, minutes, 0, 0);

			// If selected time is in the past, add days until we reach the same weekday in the future
			if (selectedDate < now) {
				selectedDate.setDate(selectedDate.getDate() + 7);
			}

			return selectedDate;
		};

		// Calculate outward route
		directionsService
			.route({
				origin: new google.maps.LatLng(selectedCar.coordinates.lat, selectedCar.coordinates.lng),
				destination: destination,
				travelMode: google.maps.TravelMode.DRIVING,
				drivingOptions: {
					departureTime: getDepartureDate()
				}
			})
			.then((response) => {
				const route = response.routes[0];
				if (!route || !route.legs?.[0]) {
					throw new Error('No route found');
				}

				const points = route.overview_path;
				const distance = route.legs[0].distance?.value ?? 0;
				const duration = route.legs[0].duration?.value ?? 0;

				// Update outward route state variables
				routeDistance = distance / 1000;
				routeDuration = duration / 60;
				detailsVisible = true;

				// Create outward route polyline
				const polyline = new google.maps.maps3d.Polyline3DElement({
					coordinates: points.map((point) => ({ lat: point.lat(), lng: point.lng() })),
					strokeColor: 'blue',
					outerColor: 'white',
					strokeWidth: 10,
					outerWidth: 0.4,
					altitudeMode: google.maps.maps3d.AltitudeMode.RELATIVE_TO_GROUND,
					drawsOccludedSegments: true
				});

				// Remove previous route polyline if it exists
				if (currentRoutePolyline) {
					map.removeChild(currentRoutePolyline);
					currentRoutePolyline = null;
				}
				// Add new polyline and store reference
				map.append(polyline);
				currentRoutePolyline = polyline;

				// Calculate return route
				return directionsService.route({
					origin: destination,
					destination: new google.maps.LatLng(
						selectedCar.coordinates.lat,
						selectedCar.coordinates.lng
					),
					travelMode: google.maps.TravelMode.DRIVING
				});
			})
			.then((response) => {
				const route = response.routes[0];
				if (!route || !route.legs?.[0]) {
					throw new Error('No return route found');
				}

				const points = route.overview_path;
				const distance = route.legs[0].distance?.value ?? 0;
				const duration = route.legs[0].duration?.value ?? 0;

				// Update return route state variables
				returnRouteDistance = distance / 1000;
				returnRouteDuration = duration / 60;

				// Calculate total duration including time at destination
				const outwardMinutes = routeDuration;
				const returnMinutes = duration / 60;
				const destinationMinutes = hoursAtDestination * 60;
				totalDuration = `${outwardMinutes + returnMinutes + destinationMinutes} min total`;

				// Create return route polyline
				const returnPolyline = new google.maps.maps3d.Polyline3DElement({
					coordinates: points.map((point) => ({ lat: point.lat(), lng: point.lng() })),
					strokeColor: 'red',
					outerColor: 'white',
					strokeWidth: 10,
					outerWidth: 0.4,
					altitudeMode: google.maps.maps3d.AltitudeMode.RELATIVE_TO_GROUND,
					drawsOccludedSegments: true
				});

				// Remove previous return route polyline if it exists
				if (returnRoutePolyline) {
					map.removeChild(returnRoutePolyline);
					returnRoutePolyline = null;
				}
				// Add new return polyline and store reference
				map.append(returnPolyline);
				returnRoutePolyline = returnPolyline;

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
				//@ts-ignore
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
			})
			.catch((e: Error) => {
				console.error(e.message);
				throw e;
			});
	}

	// Add effect to recalculate total duration when hours change
	$effect(() => {
		if (routeDuration && returnRouteDuration) {
			const outwardMinutes = routeDuration;
			const returnMinutes = returnRouteDuration;
			const destinationMinutes = hoursAtDestination * 60;
			totalDuration = `${outwardMinutes + returnMinutes + destinationMinutes} min total`;
		}
	});

	async function onAutocompleteSelect({ placePrediction }: { placePrediction: any }) {
		const place = placePrediction.toPlace();
		await place.fetchFields({ fields: ['displayName', 'location'] });

		const placeLocation = new google.maps.LatLng(place.location.lat(), place.location.lng());
		calculateAndDisplayRoute(placeLocation);
		currentDestination = placeLocation;
	}

	async function getElevationforPoint(location: google.maps.LatLng): Promise<number> {
		const elevatorService = new google.maps.ElevationService();
		const elevationResponse = await elevatorService.getElevationForLocations({
			locations: [location]
		});
		if (!(elevationResponse.results && elevationResponse.results.length)) {
			window.alert(`Insufficient elevation data for location`);
			return 0;
		}
		const elevation = elevationResponse.results[0].elevation ?? 10;
		return elevation;
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

			const style = document.createElement('style');

			// Apply our own styles to the shadow DOM.
			style.textContent = `
			.widget-container {
				border: none !important;
			}
			.input-container {
				padding: 0px !important;
			}
			.focus-ring {
				display: none !important;
			}
			.attributions {
				display: none !important;
			}
			input {
				--tw-text-opacity: 1;
				background-color: transparent;
			}
			.dropdown {
				width: 100% !important;
				max-width: 100% !important;
			}
			`;

			shadow.appendChild(style);

			// Set the shadowRoot property to the new shadow root that has our styles in it.
			return shadow;
		}
		// ...for other elements, proceed with the original behaviour of attachShadow().
		return attachShadow.call(this, init);
	};
</script>

<svelte:head>
	<title>Autoteiler Planer</title>
</svelte:head>

<div class="h-screen w-full">
	<gmp-map-3d
		id="map"
		bind:this={map}
		center={{ lat: 48.01596129402924, lng: 11.585830501630623, altitude: 550 }}
		tilt={72}
		heading={-75.56109650818874}
		range={1079.504385144246}
		roll={0}
		mode="HYBRID"
		class="h-full w-full"
	></gmp-map-3d>

	<div
		class="absolute left-4 top-4 z-10 rounded-2xl backdrop-blur-md bg-black/30 border border-white/10 shadow-2xl w-[490px]"
		id="pac-card"
	>
		<div class="bg-yellow-400/20 px-4 py-2.5 rounded-t-2xl border-b border-white/10">
			<div class="text-white font-medium flex items-center gap-2">
				<ChevronRightOutline class="h-5 w-5" />
				Fahrt planen
			</div>
		</div>
		<div class="p-4 space-y-4">
			<div>
				<label class="text-sm font-medium text-white/90">Wähle dein Fahrzeug:</label>
				<div class="relative mt-2">
					<div class="grid grid-cols-2 gap-3">
						{#each cars as car, i}
							<button
								class="group flex flex-col rounded-xl border transition-all hover:scale-[1.02] hover:shadow-lg {selectedCarIndex ===
								i
									? 'border-yellow-400 border-3 bg-white/10 shadow-2xl shadow-yellow-400/20'
									: 'border-white/10 bg-black/20'}"
								onclick={() => (selectedCarIndex = i)}
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
										<div class="font-medium text-white text-sm">{car.model}</div>
										<div class="text-xs text-gray-300 flex items-center gap-1">
											<MapPinAltSolid class="h-3 w-3" />
											{car.address}
										</div>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="space-y-2">
				<label class="text-sm font-medium text-white/90">Ziel eingeben:</label>
				<div class="w-full flex flex-col">
					<div class="relative">
						<div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
							<SearchOutline class="w-4 h-4 text-gray-400" />
						</div>
						<gmp-place-autocomplete
							id="place-autocomplete-input"
							bind:this={placeAutocomplete}
							ongmp-select={onAutocompleteSelect}
							requestedLanguage="de"
							requestedRegion="de"
							locationBias={selectedCar.coordinates}
							unit-system="metric"
							class="p-3 pl-8 rounded-lg bg-white max-w-full"
						></gmp-place-autocomplete>
					</div>
				</div>
			</div>
		</div>
	</div>

	{#if detailsVisible}
		<div
			transition:fly={{ x: 300, duration: 500, opacity: 1 }}
			class="absolute right-4 top-4 z-10 rounded-2xl backdrop-blur-md bg-black/30 border border-white/10 p-4 text-white space-y-3 shadow-xl min-w-[300px]"
		>
			<div class="flex items-center gap-3 bg-white/5 rounded-lg p-2">
				<input
					type="time"
					bind:value={startTime}
					class="flex-1 px-2 py-1.5 text-sm bg-black/20 text-white rounded border border-white/10 focus:outline-none focus:border-blue-400"
				/>
				<span class="text-sm text-white/70">Startzeit</span>
			</div>

			<div class="border-t border-white/10 pt-3">
				<div class="font-medium mb-2 text-blue-200">Hinfahrt</div>
				<div class="grid grid-cols-2 gap-2 text-sm">
					{#if routeDistance}<div>
							Entfernung: <span class="font-medium">{formatDistance(outwardKmTween.current)}</span>
						</div>{/if}
					{#if routeDuration}<div>
							Dauer: <span class="font-medium">{Math.round(outwardMinutesTween.current)} min</span>
						</div>{/if}
				</div>
			</div>

			<div class="border-t border-white/10 pt-3 max-w-[300px]">
				<div class="font-medium mb-2 text-blue-200 truncate">
					Zeit {placeName ? 'in ' + placeName : 'am Zielort'}
				</div>
				<div class="flex items-center gap-3 bg-white/5 rounded-lg p-2">
					<input
						type="number"
						min="0"
						step="0.5"
						bind:value={hoursAtDestination}
						class="flex-1 px-2 py-1.5 text-sm bg-black/20 text-white rounded border border-white/10 focus:outline-none focus:border-blue-400"
					/>
					<span class="text-sm text-white/70">Stunden</span>
				</div>
			</div>

			<div class="border-t border-white/10 pt-3">
				<div class="font-medium mb-2 text-blue-200">Rückfahrt</div>
				<div class="grid grid-cols-2 gap-2 text-sm">
					{#if returnRouteDistance}<div>
							Entfernung: <span class="font-medium">{formatDistance(returnKmTween.current)}</span>
						</div>{/if}
					{#if returnRouteDuration}<div>
							Dauer: <span class="font-medium">{Math.round(returnMinutesTween.current)} min</span>
						</div>{/if}
				</div>
			</div>

			{#if totalDuration}
				<div class="border-t border-white/10 pt-3">
					<div class="font-medium mb-2 text-blue-200">Kostenberechnung</div>
					<div class="space-y-2">
						{#if kmPrice}
							<div class="bg-white/5 rounded-lg p-2">
								<div class="text-xs text-white/70">Kilometerkosten ({formatDistance(totalKm)})</div>
								<div class="text-lg font-medium">
									{formatPrice(kmPriceTween.current)}
								</div>
							</div>
						{/if}

						{#if timePrice}
							<div class="bg-white/5 rounded-lg p-2">
								<div class="text-xs text-white/70">Zeitkosten ({Math.round(totalMinutes)} min)</div>
								<div class="text-lg font-medium">
									{formatPrice(timePriceTween.current)}
								</div>
							</div>
						{/if}

						{#if totalPrice}
							<div class="bg-yellow-400/20 rounded-lg p-3 mt-3">
								<div class="text-xs text-white/70">Gesamtkosten</div>
								<div class="text-2xl font-medium text-white">
									{formatPrice(totalPriceTween.current)}
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
