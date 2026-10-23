# Autoteiler Planner

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Embedding the planner elsewhere

`src/lib/Planner.svelte` is a self-contained Svelte 5 component. It takes `cars` (see `src/lib/cars.json`
for the shape) and `accessToken` (a public Mapbox token, `pk.…`) as props and fills its parent element, so
give that element a height. The map is Mapbox GL JS with the Standard style; places are found with the
Search Box component and routes come from the Directions API, so the token needs those scopes (the default
public scopes suffice). Set `PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env` to run the standalone app. Prices per car class are configured in `src/lib/pricing.json`. The route in `src/routes`
is a thin page around it; the AUTOteiler website renders the same component as an Astro island.
