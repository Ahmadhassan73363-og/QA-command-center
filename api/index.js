import { app } from '../dist/api/server.js';

let isReady = false;

export default async function handler(req, res) {
  if (!isReady) {
    await app.ready();
    isReady = true;
  }
  app.server.emit('request', req, res);
}
