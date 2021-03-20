const actionQueue = [];  // TODO: persist queue locally
let timer;
function add(request) {
	actionQueue.push(request);
	processQueue();
}

async function processQueue() {
	if (timer) clearTimeout(timer);
	while (actionQueue.length > 0) {
		try {
			nextAction = actionQueue[0];
			await fetch(nextAction);
			actionQueue.shift();
		} catch (error) {
			console.error("Can't process", nextAction, error.message);
			timer = setTimeout(processQueue, 5000);
			return;
		}
	}
}

function getQueue() {
	return actionQueue;
}

module.exports = { add, getQueue };
