if (!clientVariables) throw "Can't find `clientVariables` in global scope";


require("./poll")(clientVariables.mediaManager);
const isCastReceiver = require("./cast-receiver")(clientVariables.mediaManager);
require("./navbar");
require("./keyboard");
require("./controls")(clientVariables.mediaManager);
require("./cast-sender");
require("./updateUI");