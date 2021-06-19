async function init() {
	try {
		if (!('serviceWorker' in navigator)) throw "no service worker support";
		if ('cast' in window) throw "too taxing for cast devices, aborting";
		const registration = await navigator.serviceWorker.register('/serviceworker-v3.js');
		console.log('ServiceWorker registration successful with scope: ' + registration.scope);
		registration.update();
	} catch (error) {
		console.error('ServiceWorker registration failed: ' + error);
	}
}

init();