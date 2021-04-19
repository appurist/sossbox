#!/usr/bin/env node
// Require the framework and instantiate it
const path = require('path')
const fastify = require('fastify')
const fastifyCORS = require('fastify-cors')
const fastifyStatic = require('fastify-static');
const {SERVER_CFG, KEY_FILE, CRT_FILE} = require('./src/constants')
const io = require('./src/io')
const Site = require('./src/site')
const routes = require('./src/routes')

const Logger = require('./src/logger');
let logger = console; // for now

// read .env and .env.defaults
require('dotenv-defaults/config');

let listener = undefined;
let site = undefined;

let corsOptions = { origin: true };

// Initialize and maintain the pid file.
const npid = require('npid');
const { unlinkSync } = require('fs');
const PIDFILE = path.join(process.cwd(),'sossbox.pid')
let pid = undefined;  // the npid instance

function handleShutdown(rc) {
  if (listener) {
    logger.info(`Closing main listener...`);
    listener.close();
  }
  process.exit(rc);
}

// unconditionally delete any existing pid file on startup, to ensure it's always the latest run.
try { unlinkSync(PIDFILE); } catch (err) {}
try {
  pid = npid.create(PIDFILE);
  pid.removeOnExit();
} catch (err) {
  logger.info(err);
  process.exit(1);
}
// pid file handling requires process.exit to be called on SIGTERM and SIGINT, which we want anyway.
process.on('SIGTERM', () => {
  logger.info('Terminate (SIGTERM) signal received.');
  handleShutdown(0);
});
process.on('SIGINT', () => {
  logger.info('Interrupt (SIGINT) signal received.');
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
    logger.info(`${id}: Enabled HTTPS via SSL certificate files.`);
    return sslOptions;
  } else {
    logger.warn(`${id}: HTTP only. HTTPS disabled. (SSL certificate files NOT provided.)`);
    return options;
  }
}

function onError(err) {
  logger.error("Server error:", err.message);
  if (err.code === 'EADDRINUSE') {
    logger.info(" To continue: Restart this server after changing the indicated port number, or stopping the conflicting service.");
  }
  handleShutdown(1);  //mandatory return code (as per the Node.js docs)
}

process.on('uncaughtException', onError);
  
function listenerStart(listener, id, host, port) {
  // Start the server listening.
  listener.listen(port, host, (err) => {
    if (err) {
      logger.error(err.message);
      handleShutdown(1);
    }

    let port = listener.server.address().port;
    logger.info(`${id}: Now listening on port ${port}.`);
  })

  // dump routes at startup?
  if (process.argv.includes('--dump')) {
    logger.warn(`Routes for '${id}'on port ${port}:`)
    listener.ready(() => { logger.info(listener.printRoutes()) })
  }
}

let rootFolder = process.cwd();

// Returns the fastify instance on success.
async function serverInit() {
  site = new Site(rootFolder);
  if (!site) {
    logger.error("Environment configuration error: ", site);
    return null;
  }
  await site.initSite(SERVER_CFG);

  if (site.hasOwnProperty("cors")) {
    corsOptions = mainsite.cors;  // usually  { origin: true }
  }
  logger.info("CORS support:", corsOptions)

  let sslPath = path.join(site.siteBase, 'ssl');
  site.options = await getListenerOptions(site.id, sslPath);
  let loglevel = site.loglevel;
  if ((loglevel === 'false') || (loglevel === '0')) { // it's strings in env/cfg
    loglevel = false;
  }
  if (loglevel === 'true') {
    loglevel = 'error'; // provide a default level
  }
  let logfile = site.logfile || `sossbox.log`
  logger = new Logger(loglevel, logfile);
  site.options.logger = logger;
  logger.info(`Logging level '${loglevel}' for site '${site.id}' in ${logfile}`);

  // Save the fastify site listener for easy access.
  site.listener = fastify(site.options);
  site.listener.register(fastifyCORS, corsOptions);
  listener = site.listener;

  // Initialize the SOSSBox server REST API endpoints.
  if (site.storage) {
    routes.initRoutes(site);
  }

  if (site.sitePublic) {
    logger.info(`${site.id}: Serving static files on port ${site.port} at '${site.prefix}' from ${site.sitePublic}`);
    let staticOptions = {
      // list: true,
      root: site.sitePublic
    }
    if (site.prefix && site.prefix !== '/') {
      // redirect /prefix to /prefix/ to allow file peers to work
      staticOptions.redirect = true;
      staticOptions.prefix = site.prefix;
    }
    site.listener.register(fastifyStatic, staticOptions);
  };

  let port = site.port || (site.options.https ? 443 : 80);
  let host = site.host || '0.0.0.0'; // all NICs
  let id = site.id || 'sossbox';
  let name = site.domain || id;
  site.listener.get('/', (request, reply) => {
    reply.send('You have reached the API server for '+name)
  });

  // Actually start listening on the port now.
  try {
    listenerStart(listener, id, host, port);
  } catch (err) {
    logger.error(err.message)
  }
  return listener;
}

// Mainline / top-level async function invocation.
(async () => {
  try {
    await serverInit();  // returns a fastify instance
  } catch (e) {
    logger.error(e);
  }
})();