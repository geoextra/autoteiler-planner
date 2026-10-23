<script lang="ts">
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import Planner from '$lib/Planner.svelte';
</script>

<svelte:head>
	<title>Autoteiler Planer</title>
</svelte:head>

<div class="h-screen w-full">
	<Planner accessToken={PUBLIC_MAPBOX_ACCESS_TOKEN} />
</div>
