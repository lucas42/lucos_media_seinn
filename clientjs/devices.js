const { v4: uuidv4 } = require('uuid');
const pubsub = require("./pubsub");
const manager = require("./manager");
const currentDevice = require("./current-device");

function updateCurrentDevice(data) {
	const device = data.thisDevice;

	// If name hasn't changed, then don't take action
	if (device.name === currentDevice.getName()) return;

	// If the server is still using a default name, then update it with the local one
	if (currentDevice.getName() && device.isDefaultName) {
		return manager.post("devices", {
			uuid: currentDevice.getUuid(),
			name: currentDevice.getName()
		});
	}

	// Otherwise server provided name takes precedent
	currentDevice.setName(device.name);
}

/**
 * Very hacky abuse of the pubsub library not deep cloning objects
 * Also depends on events being fired in a particular order
 */
function modifyData(data) {
	data.devices.sort((a, b) => {
		if (a.uuid === currentDevice.getUuid()) return -1;
		if (b.uuid === currentDevice.getUuid()) return 1;
		if (a.isConnected !=  b.isConnected) return a.isConnected ? -1 : 1;
		if (a.name === b.name) return 0;
		return a.name > b.name ? 1 : -1;
	});
	data.thisDevice = data.devices.find(device => device.uuid === currentDevice.getUuid());
	if (!data.thisDevice) {
		throw "Connected device not returned by server"
	}
}

pubsub.listenExisting("managerData", modifyData, true);
pubsub.listenExisting("managerData", updateCurrentDevice, true);