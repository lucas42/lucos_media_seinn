const RESOURCE_CACHE = 'resources-v3';
const localUrls = [
	'/',
	'/v3',
	'/v3.css',
	'/v3.js',
	'/logo.jpg',
];
const crossDomainUrls = [
	'https://l42.eu/logo.png',
	'//www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1',
	'//www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js',
	'//www.gstatic.com/cast/sdk/libs/sender/1.0/cast_framework.js',
	'//www.gstatic.com/eureka/clank/89/cast_sender.js',
];
async function refresh() {
	try {
		const cache = await caches.open(RESOURCE_CACHE);
		await cache.addAll(localUrls);

		// `addAll` doesn't work for URLs which need a `no-cors` request
		// Instead need to fetch them individually and call `put`
		Promise.all(crossDomainUrls.map(async url => {
			const request = new Request(url, {mode: 'no-cors'})
			const response = await fetch(request);
			await cache.put(request, response);
		}));
	} catch (error) {
		console.error("Failed to cache resources:", error.message);
	}
}


module.exports = {refresh}