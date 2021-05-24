#!/usr/bin/env node
// Require the framework and instantiate it
const path = require('path')
const fastify = require('fastify')
const fastifyCORS = require('fastify-cors')
const fastifyStatic = require('fastify-static');
const {SERVER_CFG, KEY_FILE, CRT_FILE} = require('./src/constants')

const log = require('./src/log');
const io = require('./src/io')
const Store = require('./src/store')
const routes = require('./src/routes')

// read .env and .env.defaults
require('dotenv-defaults/config');

let listener = undefined;
let store = undefined;

let corsOptions = { origin: true };

// Initialize and maintain the pid file.
const npid = require('npid');
const { unlinkSync } = require('fs');
const PIDFILE = path.join(process.cwd(),'sossbox.pid')
let pid = undefined;  // the npid instance

function handleShutdown(rc) {
  if (listener) {
    log.info(`Closing main listener...`);
    listener.close();
  }
  if (rc !== 0)
    log.error(`Process exit: ${rc}`);
  else
    log.force(`Process exit: ${rc}`);
  setTimeout(()=>process.exit(rc), 250);
}

// unconditionally delete any existing pid file on startup, to ensure it's always the latest run.
try { unlinkSync(PIDFILE); } catch (err) {}
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
  let sslOptions = undefined;

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
  
function listenerStart(listener, id, host, port) {
  // Start the server listening.
  listener.listen(port, host, (err) => {
    if (err) {
      log.error(err.message);
      handleShutdown(1);
    }

    let port = listener.server.address().port;
    log.info(`${id}: Now listening on port ${port}.`);
  })

  // dump routes at startup?
  if (process.argv.includes('--dump')) {
    log.warn(`Routes for '${id}'on port ${port}:`)
    listener.ready(() => { log.info(listener.printRoutes()) })
  }
}

let rootFolder = process.cwd();

// Returns the fastify instance on success.
async function serverInit() {
  store = new Store(rootFolder);
  if (!store) {
    log.error(`Environment configuration error: ${store}`);
    return null;
  }
  await store.init(SERVER_CFG);

  if (store.cors) {
    corsOptions = store.cors;  // usually  { origin: true }
  }
  log.info(`CORS support: ${corsOptions}`);

  let sslPath = path.join(store.base, 'ssl');
  store.options = await getListenerOptions(store.id, sslPath);
  let loglevel = store.loglevel;
  if ((loglevel === 'false') || (loglevel === '0')) { // it's strings in env/cfg
    loglevel = false;
  }
  if (loglevel === 'true') {
    loglevel = 'error'; // provide a default level
  }
  let logfile = store.logfile || `sossbox.log`
  log.init(loglevel, logfile);

  store.options.logger = log;
  log.info(`Logging level '${loglevel}' for store '${store.id}' in ${logfile}`);

  // Save the fastify listener for easy access.
  store.listener = fastify(store.options);
  store.listener.register(fastifyCORS, corsOptions);
  listener = store.listener;

  // Initialize the SOSSBox server REST API endpoints.
  if (store.storage) {
    routes.initRoutes(store);
  }

  let port = store.port || (store.options.https ? 443 : 80);
  let host = store.host || '0.0.0.0'; // all NICs
  let id = store.id || 'sossbox';
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
    store.listener.register(fastifyStatic, staticOptions);

    // this will work with fastify-static and send /index.html
    store.listener.setNotFoundHandler((_, reply) => {
      reply.sendFile('index.html');
      //reply.redirect('/index.html');
    })
  } else {
    store.listener.get('/', (_, reply) => {
      reply.send('You have reached the API server for '+name)
    });
  }

  // Actually start listening on the port now.
  try {
    listenerStart(listener, id, host, port);
  } catch (err) {
    log.error(err.message)
  }
  return listener;
}

// Mainline / top-level async function invocation.
(async () => {
  try {
    await serverInit();  // returns a fastify instance
  } catch (e) {
    log.error(e.message);
  }
})();