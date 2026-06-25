import '../utils/init-variables.js';
import {refresh} from './static-resources.js';
import { queueAndAttemptRequest } from 'restful-queue';
import { getPoll, modifyPollData } from './polling.js';
import './preload.js';
import './update.js';
import { recordCacheHit } from './cache-eviction.js';
import { createHandleRequest } from './handle-request.js';

self.addEventListener('install', event => {
	event.waitUntil(refresh());
});

const handleRequest = createHandleRequest({ queueAndAttemptRequest, getPoll, modifyPollData, recordCacheHit });

self.addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});
