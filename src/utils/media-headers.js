const { promise, resolve } = Promise.withResolvers();
export function init(mediaCreds) {
	const mediaHeaders = new Headers();
	mediaHeaders.set('Authorization', `Basic ${btoa(`${mediaCreds.user}:${mediaCreds.password}`)}`);
	resolve(mediaHeaders);
}

export function getMediaHeaders() {
	return promise;
}