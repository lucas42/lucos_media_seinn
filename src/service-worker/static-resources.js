const RESOURCE_CACHE = 'resources-v3';
const localUrls = [
	'/',
	'/v3',
	'/v3.css',
	'/v3.js',
	'/logo.jpg',
	'/manifest.json',
];
export async function refresh() {
	try {
		await caches.delete('resources-v1');
		const cache = await caches.open(RESOURCE_CACHE);
		await cache.addAll(localUrls);
	} catch (error) {
		console.error("Failed to cache resources:", error.message);
	}
}