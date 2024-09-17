import { init } from '../classes/manager.js';

/**
 * Client variables are added dynamically to the service worker file by the server
 **/
if (!clientVariables) throw "Can't find `clientVariables` in global scope";
const { mediaManager, apiKey } = clientVariables;

init(mediaManager, apiKey);