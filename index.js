const express = require('express');
const app = express();
var port = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

app.listen(port, function () {
  console.log('Example app listening on port ' + port);
});