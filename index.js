const express = require('express');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;
const dataOrigin = process.env.MEDIA_MANAGER || "https://ceol.l42.eu/";
const dataOriginLine = "const dataOrigin = \""+dataOrigin.replace(/"/g, "\\\"")+"\";\n";

// Handle javascript files specially and include data origin as first line
app.get('/:file.js', function(req, res, next){
	fs.readFile(__dirname + '/public'+req.path, 'utf8', function(err, contents) {
		if (!contents) {
			next();
			return;
		}
		res.set('Content-Type', 'text/javascript');
		res.send(dataOriginLine+contents);
	});
});

app.use(express.static(__dirname + '/public', {extensions: ['json']}));


// Engine config needs set up at the app level, rather than just on router
app.engine('mustache', require('mustache-express')());
app.set('view engine', 'mustache');
app.set('views', `${__dirname}/views`);

app.use('/v3', require('./v3'));

app.listen(port, function () {
  console.log('App listening on port ' + port);
});