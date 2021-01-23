if (!clientVariables) throw "Can't find `clientVariables` in global scope";

const isCastReceiver = require("./cast-receiver")(clientVariables.mediaManager);
require("./navbar");
require("./keyboard");
require("./controls")(clientVariables.mediaManager);

if (!isCastReceiver) {
	require("./cast-sender");
	require("./updates")(clientVariables.mediaManager);
	require("./updateUI");

}