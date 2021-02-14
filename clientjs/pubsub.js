
var msgListeners = {}, triggered = {}, msg;
window.addEventListener('message', function _parsewindowmessage(event) {
	try {
		msg = JSON.parse(event.data);
	} catch (e) {
		event.preventDefault();
		return;
	}
	if (msg.type) trigger(msg.type, msg, event.source, false);

}, false);

/**
 * Listen for messages of a given type
 */
function listen(type, callback, internalonly) {
	if (!msgListeners[type]) msgListeners[type] = [];
	msgListeners[type].push({
		callback: callback,
		ext: !internalonly
	});
}
function unlisten(type, callback) {
	if (msgListeners[type]) for (var ii in msgListeners[type]) {
		if (msgListeners[type][ii].callback == callback) return delete msgListeners[type][ii];
	}
	return false;
}
		  
/*
* Calls callback if message has already happened (passing most recent value), then listens for future calls
*
* Only works for internal messages
* 
*/
function listenExisting(type, callback) {
	listen(type, callback, true);
	if (triggered.hasOwnProperty(type)) {
		callback(triggered[type], window);
	}

}

/*
 * Calls callback if message has already happened, otherwise listens for it once
 * 
 * Only works for internal messages
 * 
 */
function waitFor(type, callback) {
	function callbackwrapper(msg) {
		unlisten(type, callbackwrapper, true);
		callback(msg, window);
	}
	listenExisting(type, callbackwrapper, true);
}

function trigger(type, msg, source, internal) {
	if (internal) triggered[type] = msg;
	if (msgListeners[type]) for (var ii in msgListeners[type]) {
		if (internal || msgListeners[type][ii].ext) {
			try {
				msgListeners[type][ii].callback(msg, source);
			} catch (error) {
				console.error(`Error when triggering pubsub message "${type}"\n`, error);
			}
		}
	}
}
function send(type, msg, target) {
	if (!target || target == window) return trigger(type, msg, window, true);
	if (!msg) msg = {};
	msg.type = type;
	target.postMessage(JSON.stringify(msg), '*');
}
module.exports = {
	send: send,
	listen: listen,
	unlisten: unlisten,
	waitFor: waitFor,
	listenExisting: listenExisting
}
