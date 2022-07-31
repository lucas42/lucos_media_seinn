import express from 'express';
import fs from 'fs';
import v3 from './v3.js';
import mustacheExpress from 'mustache-express';
const app = express();
const port = process.env.PORT || 3000;

// Engine config needs set up at the app level, rather than just on router
app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', `./src/views`);

app.use('/v3', v3);
app.use('/', v3);

app.use(express.static('./src/public', {extensions: ['json']}));
app.listen(port, function () {
  console.log('App listening on port ' + port);
});