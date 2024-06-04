import { listen } from 'lucos_pubsub';
listen("polling_connected", () => {
	document.getElementsByTagName('lucos-navbar')[0].setAttribute('streaming', 'active');
});
listen("polling_disconnected", () => {
	document.getElementsByTagName('lucos-navbar')[0].setAttribute('streaming', 'stopped');
});
