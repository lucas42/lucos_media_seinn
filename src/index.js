const express = require('express');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Engine config needs set up at the app level, rather than just on router
app.engine('mustache', require('mustache-express')());
app.set('view engine', 'mustache');
app.set('views', `${__dirname}/views`);

app.use('/v3', require('./v3'));
app.use('/', require('./v3'));

app.use(express.static(__dirname + '/public', {extensions: ['json']}));
app.listen(port, function () {
  console.log('App listening on port ' + port);
});