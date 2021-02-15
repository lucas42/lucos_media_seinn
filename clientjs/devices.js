const { v4: uuidv4 } = require('uuid');
const manager = require("./manager");
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

	// If the server doesn't know about this device, tell it
	if (!device) {
		manager.post("devices", {uuid, name});

		// No need to do anything yet - server should update again as soon as it's got the new device
		return;
	}

	// If nothing has changed, then don't take action
	if (device.name === name && device.isCurrent === isCurrent) return;

	name = device.name;
	localStorage.setItem('device-name', name);
	isCurrent = device.isCurrent;
	pubsub.send("deviceSwitch", device);
}

/**
 * Very hacky abuse of the pubsub library not deep cloning objects
 * Also depends on events being fired in a particular order
 */
function modifyData(data) {
	data.thisDevice = data.devices.find(device => device.uuid === uuid);
	if (!data.thisDevice || !data.thisDevice.isCurrent) data.isPlaying = false;
}

pubsub.listenExisting("managerData", modifyData, true);
pubsub.listenExisting("managerData", updateDevice, true);