// Vercel serverless entry point.
// Vercel's Node runtime invokes the default export as (req, res); an Express
// app instance is exactly that, so we hand it the built app. All routing,
// middleware and error handling live in src/. `app.listen` is NOT called here
// (server.js only listens when run directly), which is correct for serverless.
import createApp from '../src/server.js';

const app = createApp();

export default app;
