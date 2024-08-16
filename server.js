#!/usr/bin/env node
// Require the framework and instantiate it
const path = require('node:path')
const Koa = require("koa")
const serve = require("koa-static")
const Router = require('@koa/router');

const {SERVER_CFG, KEY_FILE, CRT_FILE} = require('./src/constants')

const log = require('./src/log');
const io = require('./src/io')
const Store = require('./src/store')
const routes = require('./src/routes')

// read .env and .env.defaults
require('dotenv-defaults/config');

let app;
let store = null;

let corsOptions = { origin: true };

// Initialize and maintain the pid file.
const npid = require('npid');
const { unlinkSync } = require('fs');
const PIDFILE = path.join(process.cwd(),'sossdata.pid')
let pid = null;  // the npid instance

function handleShutdown(rc) {
  if (app) {
    log.info(`Closing main app listener...`);
    app.close();
  }
  if (rc !== 0)
    log.error(`Process exit: ${rc}`);
  else
    log.force(`Process exit: ${rc}`);
  setTimeout(()=>process.exit(rc), 250);
}

// unconditionally delete any existing pid file on startup, to ensure it's always the latest run.
try { unlinkSync(PIDFILE); } catch (err) { /* do nothing */ }
try {
  pid = npid.create(PIDFILE);
  pid.removeOnExit();
} catch (err) {
  log.info(err);
  process.exit(1);
}
// pid file handling requires process.exit to be called on SIGTERM and SIGINT, which we want anyway.
process.on('SIGTERM', () => {
  log.info('Terminate (SIGTERM) signal received.');
  handleShutdown(0);
});
process.on('SIGINT', () => {
  log.info('Interrupt (SIGINT) signal received.');
  handleShutdown(0);
});

// Returns the SSL or non-SSL related options
async function getListenerOptions(id, sslPath) {
  let options = { };
  let sslOptions = null;

  let keyExists = await io.fileExists(sslPath, KEY_FILE)
  let crtExists = await io.fileExists(sslPath, CRT_FILE)
  if (keyExists && crtExists) {
    let sslkey = await io.fileGet(sslPath, KEY_FILE)
    let sslcrt = await io.fileGet(sslPath, CRT_FILE)

    sslOptions = {
      http2: true,
      https: {
        allowHTTP1: true, // fallback support for HTTP1
        key: sslkey,
        cert: sslcrt
      }
    }
    log.info(`${id}: Enabled HTTPS via SSL certificate files.`);
    return sslOptions;
  } else {
    log.warn(`${id}: HTTP only. HTTPS disabled. (SSL certificate files NOT provided.)`);
    return options;
  }
}

function onError(err) {
  log.error(`Server error: ${err.message}`);
  if (err.code === 'EADDRINUSE') {
    log.info(" To continue: Restart this server after changing the indicated port number, or stopping the conflicting service.");
  }
  handleShutdown(1);  //mandatory return code (as per the Node.js docs)
}

process.on('uncaughtException', onError);

let rootFolder = process.cwd();

// Returns the fastify instance on success.
async function serverInit() {
  store = new Store(rootFolder);
  if (!store) {
    log.error(`Environment configuration error: ${JSON.stringify(store)}`);
    return null;
  }
  await store.init(SERVER_CFG);

  if (store.cors) {
    corsOptions = store.cors;  // usually  { origin: true }
  }
  log.info(`CORS support: ${JSON.stringify(corsOptions)}`);

  let sslPath = path.join(store.base, 'ssl');
  store.options = await getListenerOptions(store.id, sslPath);
  let loglevel = store.loglevel;
  if ((loglevel === 'false') || (loglevel === '0')) { // it's strings in env/cfg
    loglevel = false;
  }
  if (loglevel === 'true') {
    loglevel = 'error'; // provide a default level
  }
  let logfile = store.logfile || `sossdata.log`
  log.init(loglevel, logfile);

  store.options.logger = true;
  log.info(`Logging level '${loglevel}' for store '${store.id}' in ${logfile}`);

  // Initialize the Koa server.
  const app = new Koa();
  let router = new Router();

  app.use(serve("public"));
  // app.use(serve(path.join(__dirname, '/public')))

  // Initialize the SOSSData server REST API endpoints.
  if (store.storage) {
    routes.initRoutes(router, store);
  }

  let port = store.port || (store.options.https ? 443 : 80);
  let host = store.host || '0.0.0.0'; // all NICs
  let id = store.id || 'sossdata';
  let name = store.domain || id;

  if (store.public) {
    log.info(`${store.id}: Serving static files on port ${store.port} at '${store.api}' from ${store.public}`);
    let staticOptions = {
      // list: true,
      root: store.public
    }
    if (store.api && store.api !== '/') {
      // redirect /api to /api/ to allow file peers to work
      staticOptions.redirect = true;
      staticOptions.prefix = store.api;
    }

    // appStart(app, store.id, store.host, store.port);
  } else {
    app.get('/api', (_, reply) => {
      reply.send('You have reached the API server for '+name)
    });
  }

  // Actually start listening on the port now.
  try {
    app.use(router.routes())
    app.use(router.allowedMethods());
    // Start the server listening.
    app.listen({ port, host });
    log.info(`Server '${id}' listening on port ${port} ...`);

    // dump routes at startup?
    if (process.argv.includes('--dump')) {
      log.warn(`Routes for '${id}'on port ${port}:`)
      app.ready(() => { log.info(app.printRoutes()) })
    }

  } catch (err) {
    log.error(err.message)
  }
  return app;
}

// Mainline / top-level async function invocation.
(async () => {
  try {
    await serverInit();  // returns a fastify instance
  } catch (e) {
    log.error(e.message);
  }
})();
