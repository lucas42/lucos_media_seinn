import { v4 as uuidv4 } from 'uuid';

let uuid;
let name;
let current;

if (typeof localStorage !== 'undefined') {
	uuid = localStorage.getItem('device-uuid');
	name = localStorage.getItem('device-name');

	if (!uuid) {
		uuid = uuidv4();
		localStorage.setItem('device-uuid', uuid);
	}
}

export function getUuid() {
	return uuid;
}
export function setUuid(newUuid) {
	if (uuid === newUuid) return;
	if (uuid !== undefined) throw "Device uuid already set, can't change";
	uuid = newUuid;
}
export function getName() {
	return name;
}
export function setName(newName) {
	name = newName;
	if (typeof localStorage !== 'undefined') localStorage.setItem('device-name', name);
}
export function isCurrent() {
	return current;
}
export function setCurrent(newIsCurrent) {
	current = newIsCurrent;
}

export default {getUuid, setUuid, getName, setName, isCurrent, setCurrent};