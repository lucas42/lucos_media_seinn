const { v4: uuidv4 } = require('uuid');
const pubsub = require("./pubsub");

let uuid = localStorage.getItem('device-uuid');
let name = localStorage.getItem('device-name');
let isCurrent = false;

if (!uuid) {
	uuid = uuidv4();
	localStorage.setItem('device-uuid', uuid);
}


function updateDevice(data) {
	const device = data.thisDevice;

	// If nothing has changed, then don't take action
	if (device.name === name && device.isCurrent === isCurrent) return;

	name = device.name;

	// TODO: if the name from the server is Device X and there's something custom in localstorage,
	// then update the server with the custom one
	localStorage.setItem('device-name', name);
	isCurrent = device.isCurrent;
	pubsub.send("deviceSwitch", device);
}

/**
 * Very hacky abuse of the pubsub library not deep cloning objects
 * Also depends on events being fired in a particular order
 */
function modifyData(data) {
	data.devices.sort((a, b) => {
		if (a.uuid === uuid) return -1;
		if (b.uuid === uuid) return 1;
		if (a.isConnected !=  b.isConnected) return a.isConnected ? -1 : 1;
		if (a.name === b.name) return 0;
		return a.name > b.name ? 1 : -1;
	});
	data.thisDevice = data.devices.find(device => device.uuid === uuid);
	if (!data.thisDevice) {
		throw "Connected device not returned by server"
	}
}

function getCurrent() {
	return uuid;
}

pubsub.listenExisting("managerData", modifyData, true);
pubsub.listenExisting("managerData", updateDevice, true);

module.exports = {getCurrent};