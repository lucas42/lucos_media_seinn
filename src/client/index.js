import './init-manager.js'; // Initiate the manager first so other modules can use it immediately
import '../classes/poll.js';
import './local-device-updates.js';
import './keyboard.js';
import './media-session.js';
import './player.js';
import './track-status-update.js';
import 'lucos_navbar';
import './components/volume-control.js';
import './components/devices-overlay.js';
import './components/track-playlist.js';
import './components/now-playing.js';
import './components/edit-form.js';
import './components/playpause-form.js';
import './components/playhere-form.js';
import './components/next-form.js';
import './components/refresh-form.js';
import './components/collections-overlay.js';
import './load-service-worker.js';

const statusChannel = new BroadcastChannel("lucos_status");
statusChannel.postMessage("client-loaded"); // This tells the service worker a new client is listening, so to re-send the latest state