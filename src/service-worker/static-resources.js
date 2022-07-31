const RESOURCE_CACHE = 'resources-v3';
const localUrls = [
	'/',
	'/v3',
	'/v3.css',
	'/v3.js',
	'/logo.jpg',
	'/manifest.json',
];
const crossDomainUrls = [
	'https://l42.eu/logo.png',
	'//www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js',
];
export async function refresh() {
	try {
		await caches.delete('resources-v1');
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