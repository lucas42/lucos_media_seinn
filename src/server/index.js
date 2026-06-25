import express from 'express';
import fs from 'fs';
import v3 from './v3.js';
import { AITHNE_ORIGIN } from './auth.js';
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

app.use('/v3', v3);
app.use('/', v3);

app.listen(port, function () {
  console.log('App listening on port ' + port);
});