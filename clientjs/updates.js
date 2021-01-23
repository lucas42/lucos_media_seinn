const poll = require("./poll");
const pubsub = require("./pubsub");

function startUpdates(mediaManager) {
	pubsub.waitFor('ready', () => {
		poll(mediaManager+"poll/summary", data => {
			pubsub.send("managerData", data);
		});
	});
}

module.exports = startUpdates;