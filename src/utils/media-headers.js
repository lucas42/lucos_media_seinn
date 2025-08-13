if (!clientVariables) throw "Can't find `clientVariables` in global scope";
const { mediaCreds } = clientVariables;
const mediaHeaders = new Headers();
mediaHeaders.set('Authorization', `Basic ${btoa(`${mediaCreds.user}:${mediaCreds.password}`)}`);

export function getMediaHeaders() {
	return mediaHeaders;
}