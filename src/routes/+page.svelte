<script lang="ts">
	import { PUBLIC_GOOGLE_MAPS_API_KEY } from '$env/static/public';
	import Planner from '$lib/Planner.svelte';
</script>

<svelte:head>
	<title>Autoteiler Planer</title>
</svelte:head>

<div class="h-screen w-full">
	<Planner apiKey={PUBLIC_GOOGLE_MAPS_API_KEY} />
</div>
