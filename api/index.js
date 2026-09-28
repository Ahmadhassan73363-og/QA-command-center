// Vercel Serverless Function entrypoint
// Sets VERCEL=1 so server.js skips calling app.listen()

process.env.VERCEL = '1';

const { app } = await import('../dist/api/server.js');

await app.ready();

export default async function handler(req, res) {
  app.server.emit('request', req, res);
}
