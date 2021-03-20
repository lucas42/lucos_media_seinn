const pubsub = require("../pubsub");
const actions = require("./actions");
require("../poll");

let listeners = [];
let pollData = {};

pubsub.listenExisting("managerData", serverData => {
	console.log("new manager data", listeners.length);

	// TODO: apply modifications based on action queue
	pollData = serverData;
	updatePollDataWithActionsFromQueue();
	let resolve;
	while (resolve = listeners.shift()) {
		resolve(getCurrentResponse());
	}
});

function getCurrentResponse() {
	const blob = new Blob([JSON.stringify(pollData)]);
	return new Response(blob, {status: 200, type : 'application/json'});
}

function getPoll(hashcode) {
	if (hashcode !== pollData.hashcode) {
		return getCurrentResponse();
	}
	return new Promise(resolve => {
		listeners.push(resolve);
	});
}

function updatePollDataWithActionsFromQueue() {
	actions.getQueue()
		.forEach(modifyPollData);
}
function modifyPollData(action) {
	switch (action.url) {
		default:
			console.error("unknown action", action);
	}
}

module.exports = {getPoll, modifyPollData};