/**
 * WebLoad Node.js Synchronous Fetch Worker
 * Runs in worker thread to perform async fetch operations for the main thread.
 */

import { parentPort } from 'node:worker_threads';
import fs from 'node:fs';

const logFile = '/tmp/sync-fetch-worker.log';

function log (message) {
	fs.appendFileSync(logFile, message);
}

log(`worker started; parentPort ${parentPort ? 'yes' : 'no'}\n`);

if (parentPort) {
	parentPort.on('message', async function (msg) {
		const { id, url, tempOutPath, statusBuffer } = msg;
		const status = new Int32Array(statusBuffer);

		log(`fetch URL ${url}\n`);

		try {
			const res = await fetch(url, {
				headers: {
					'User-Agent': 'WebLoad/0.4.0 (Node.js)'
				},
				redirect: 'follow'
			});

			log(`result: ${res.ok ? 'ok' : 'err'}\n`)
			if (!res.ok) {
				const errorInfo = {
					ok: false,
					status: res.status,
					statusText: res.statusText,
					url: res.url || url
				};
				fs.writeFileSync(tempOutPath, JSON.stringify(errorInfo), 'utf8');
				Atomics.store(status, 0, 2); // 2 = error
				Atomics.notify(status, 0, 1);
				return;
			}

			const arrayBuffer = await res.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			fs.writeFileSync(tempOutPath, buffer);

			const metaInfo = {
				ok: true,
				status: res.status,
				statusText: res.statusText,
				finalUrl: res.url || url,
				contentType: res.headers.get('content-type') || 'application/javascript'
			};
			fs.writeFileSync(`${tempOutPath}.meta`, JSON.stringify(metaInfo), 'utf8');

			Atomics.store(status, 0, 1); // 1 = success
			Atomics.notify(status, 0, 1);
		} catch (err) {
			log(`error: ${err.message}\n`);
			const errorInfo = {
				ok: false,
				status: 0,
				statusText: err.message,
				url
			};
			try {
				fs.writeFileSync(tempOutPath, JSON.stringify(errorInfo), 'utf8');
			} catch {
				// ignore
			}
			Atomics.store(status, 0, 2); // 2 = error
			Atomics.notify(status, 0, 1);
		}
	});
}
