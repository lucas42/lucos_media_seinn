import { send } from 'lucos_pubsub';
import { get } from './manager.js';
import localDevice from './local-device.js';
let suppressErrors = false;
let isConnected = false;

// Don't show any errors whilst the page unloads as it gets confusing in the console whether it's the old page or new page
if (typeof window === "object") window.addEventListener("unload", event => {
	suppressErrors = true;
});


async function poll(hashcode) {
	try {
		const response = await get(`v3/poll?device=${localDevice.getUuid()}&hashcode=${hashcode}`);
		const data = await response.json();
		if (!isConnected) {
			isConnected = true;
			send("polling_connected");
		}

		// If there's a hashcode, use the new one and evaluate new data.
		if (data.hashcode) {
			hashcode = data.hashcode;
			send("managerData", data);
		}
		poll(hashcode);
	} catch(error){
		if (!suppressErrors) console.error("Error whilst polling, wait 5 seconds\n",error,hashcode);
		if (isConnected) {
			isConnected = false;
			send("polling_disconnected");
		}

		// Wait 5 second before trying again to prevent making things worse
		setTimeout(function pollRetry() {
			poll(hashcode);
		}, 5000);
	};
}

poll(null);
