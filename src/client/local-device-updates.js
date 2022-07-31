import localDevice from '../classes/local-device.js';
import { listenExisting } from 'lucos_pubsub';
import { post } from '../classes/manager.js';

function updatelocalDevice(data) {
	const device = data.devices.find(device => device.uuid === localDevice.getUuid());
	if (!device) {
		throw "Connected device not returned by server"
	}
	localDevice.setCurrent(device.isCurrent);

	// If name hasn't changed, then don't take action
	if (device.name === localDevice.getName()) return;

	// If the server is still using a default name, then update it with the local one
	if (localDevice.getName() && device.isDefaultName) {
		return post("devices", {
			uuid: localDevice.getUuid(),
			name: localDevice.getName()
		});
	}

	// Otherwise server provided name takes precedent
	localDevice.setName(device.name);
}

listenExisting("managerData", updatelocalDevice, true);