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
for the shape) and `apiKey` (Google Maps browser key) as props and fills its parent element, so give that
element a height. Prices per car class are configured in `src/lib/pricing.json`. The route in `src/routes`
is a thin page around it; the AUTOteiler website renders the same component as an Astro island.
