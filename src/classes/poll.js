import { send } from 'lucos_pubsub';
import { getJson } from './manager.js';
let suppressErrors = false;

// Don't show any errors whilst the page unloads as it gets confusing in the console whether it's the old page or new page
if (typeof window === "object") window.addEventListener("unload", event => {
	suppressErrors = true;
});


async function poll(hashcode) {
	try {
		const data = await getJson("poll/summary", { hashcode, "_cb": new Date().getTime() });

		// If there's a hashcode, use the new one and evaluate new data.
		if (data.hashcode) {
			hashcode = data.hashcode;
			send("managerData", data);
		}
		poll(hashcode);
	} catch(error){
		if (!suppressErrors) console.error("Error whilst polling, wait 5 seconds\n",error,hashcode);

		// Wait 5 second before trying again to prevent making things worse
		setTimeout(function pollRetry() {
			poll(hashcode);
		}, 5000);
	};
}

poll(null);
