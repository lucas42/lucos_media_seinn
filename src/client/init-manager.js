import { init } from '../classes/manager.js';

/**
 * Client variables are set by the server and included in a script tag
 **/
if (!clientVariables) throw "Can't find `clientVariables` in global scope";
const { mediaManager, apiKey } = clientVariables;

init(mediaManager, apiKey);