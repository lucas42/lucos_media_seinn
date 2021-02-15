
/**
 * Client variables are set by the server and included in a script tag
 * Do all the handling of them here, so individual modules don't need to interact with global scope
 **/
if (!clientVariables) throw "Can't find `clientVariables` in global scope";
const {mediaManager, receiverApplicationId} = clientVariables;

require("./manager").init(mediaManager);  // Initiate the manager first so other modules can use it immediately
require("./poll");
require("./lucos-navbar");
require("./keyboard");
require("./controls");
require("./cast-sender")(receiverApplicationId);
require("./updateUI");
require("./volume");
require("./player");
