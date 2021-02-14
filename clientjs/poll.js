const pubsub = require("./pubsub");
const manager = require("./manager");

async function poll(hashcode) {
	try {
		data = await manager.getJson("poll/summary", { hashcode, "_cb": new Date().getTime() });

		// If there's a hashcode, use the new one and evaluate new data.
		if (data.hashcode) {
			hashcode = data.hashcode;
			pubsub.send("managerData", data);
		}
		poll(hashcode);
	} catch(error){

		// Wait 5 second before trying again to prevent making things worse
		setTimeout(function pollRetry() {
			poll(hashcode);
		}, 5000);
	};
}

poll(null);