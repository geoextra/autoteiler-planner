import {
	handleErrorWithSentry,
	replayIntegration,
	replayCanvasIntegration,
	captureConsoleIntegration,
	browserProfilingIntegration,
	contextLinesIntegration
} from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
	dsn: 'https://658820d34b7baed89f29b317010d7612@o4509406541512704.ingest.de.sentry.io/4509406542757968',

	tracesSampleRate: 1.0,

	// This sets the sample rate to be 10%. You may want this to be 100% while
	// in development and sample at a lower rate in production
	replaysSessionSampleRate: 1.0,

	// If the entire session is not sampled, use the below sample rate to sample
	// sessions when an error occurs.
	replaysOnErrorSampleRate: 1.0,

	// If you don't want to use Session Replay, just remove the line below:
	integrations: [
		replayIntegration(),
		replayCanvasIntegration(),
		captureConsoleIntegration(),
		browserProfilingIntegration(),
		contextLinesIntegration()
	]
});

// If you have a custom error handler, pass it to `handleErrorWithSentry`
export const handleError = handleErrorWithSentry();
