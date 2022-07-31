const ACTION_CACHE = 'actions-v3';
let timer;

// TODO: only keep the most recent volume request and play/pause request in queue
export async function add(request) {
	const cache = await caches.open(ACTION_CACHE);

	// HACK: cache storage doesn't allow POST requests, so pretend they're GETs
	if (request.method != "POST") throw "Action must be a POST request";
	const getRequest = new Request(request, {method: "GET"});
	cache.put(getRequest, new Response()); // Doesn't matter what the response is as we only care about requests
	processQueue();
}

// TODO: process queue when device detects network change
async function processQueue() {
	if (timer) clearTimeout(timer);
	const cache = await caches.open(ACTION_CACHE);
	const actionQueue = await getQueue();
	while (actionQueue.length > 0) {
		try {
			const nextAction = actionQueue[0];
			await fetch(nextAction);
			actionQueue.shift();
			cache.delete(new Request(nextAction, {method: "GET"}));
		} catch (error) {
			console.error("Can't process", nextAction, error.message);
			timer = setTimeout(processQueue, 5000);
			return;
		}
	}
}

function getRequestTime(request) {
	const url = new URL(request.url);
	const params = new URLSearchParams(url.search);
	return params.get("update_timeset");
}
export async function getQueue() {
	const cache = await caches.open(ACTION_CACHE);
	const actionQueue = await cache.keys();
	actionQueue.sort((a,b) => {
		return  getRequestTime(a) - getRequestTime(b);
	});
	return actionQueue.map(getRequest => new Request(getRequest, {method: "POST"}));
}
