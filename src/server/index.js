import express from 'express';
import fs from 'fs';
import createV3Router from './v3.js';
import { createAuthMiddleware, AITHNE_ORIGIN } from './auth.js';
import mustacheExpress from 'mustache-express';
const app = express();
const port = process.env.PORT || 3000;

// Engine config needs set up at the app level, rather than just on router
app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', `./src/views`);
app.set('trust proxy', 1); // seinn sits behind a single nginx hop; trust X-Forwarded-For for rate limiting
app.use(express.static('./src/resources', {extensions: ['json']}));

// Inject aithne_origin into every render context so templates (including the auth
// middleware's own 403 error page) can pass it through to <lucos-navbar>.
app.use((req, res, next) => {
	res.locals.aithne_origin = AITHNE_ORIGIN;
	next();
});

// Composition root: the one place a real aithne client is constructed for
// this process (lucas42/lucos#268).
const auth = createAuthMiddleware({
	origin: AITHNE_ORIGIN,
	jwksUrl: process.env.AITHNE_JWKS_URL,
	appOrigin: process.env.APP_ORIGIN,
	environment: process.env.ENVIRONMENT,
});
const v3 = createV3Router(auth.middleware);

app.use('/v3', v3);
app.use('/', v3);

app.listen(port, function () {
  console.log('App listening on port ' + port);
});