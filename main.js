// Require the framework and instantiate it
const path = require('path')
const fastify = require('fastify')
const fastifyStatic = require('fastify-static');

const io = require('./io')
const config = require('./config')
const Site = require('./site')

const routes = require('./routes')

const KEY_FILE = 'server.key'
const CRT_FILE = 'server.crt'
const PUBLIC_FOLDER = 'public'

let serverCfg = undefined;

async function getListenerOptions(id, sslPath) {
  let options = { logger: false };
  let sslOptions = undefined;

  let keyExists = await io.fileExists(sslPath, KEY_FILE)
  let crtExists = await io.fileExists(sslPath, CRT_FILE)
  if (keyExists && crtExists) {
    let sslkey = await io.fileGet(sslPath, KEY_FILE)
    let sslcrt = await io.fileGet(sslPath, CRT_FILE)

    sslOptions = {
      logger: false,
      http2: true,
      https: {
        allowHTTP1: true, // fallback support for HTTP1
        key: sslkey,
        cert: sslcrt
      }
    }
    console.log(`${id}: Enabled HTTPS via SSL certificate files.`);
    return sslOptions;
  } else {
    console.warn(`${id}: HTTP only. HTTPS disabled. (SSL certificate files NOT provided.)`);
    return options;
  }
}

async function initListener(id, options) {
  // 'listener' is a Fastify instance. 'siteCfg' is the configuration object.
  const listener = fastify(options);
  listener.register(require('fastify-websocket'));
  // Deal with CORS by enabling it since this is an API for all.
  listener.register(require('fastify-cors'), { });
  // fastify.options('*', (request, reply) => { reply.send() })

  listener.setErrorHandler(function (error, request, reply) {
    // Send error response
    console.warn(`${siteCfg.id}: error handler for`,error);
    let code = 500;
    let message = 'Unknown server error';
    if (error.statusCode)
      code = error.statusCode;
    else
    if (error.message)
      message = error.message;
    reply.code(code).send(message);
  })

  return listener;
}

function listenerStart(listener, id, host, port) {
  // Start the server listening.
  listener.listen(port, host, (err) => {
    if (err) {
      console.error(err.message);
      process.exit(1)
    }

    let port = listener.server.address().port;
    console.log(`${id}: listening on port ${port}.`);
  })

  /*
  listener.ready(() => {
    console.log(listener.printRoutes())
  })
  */
}

// Returns the fastify instance on success.
async function serverInit() {
  serverCfg = await config.init();
  if (!serverCfg) {
    console.error("Environment configuration error: ", serverCfg);
    return null;
  }

  if (io.folderExists(process.cwd(), PUBLIC_FOLDER)) {
    let baseFolder = process.cwd();
    let sslPath = path.join(baseFolder, 'ssl');
    let options = await getListenerOptions(config.id, sslPath);
    let listener = await initListener(config.id, options);
    let serveFolder = path.join(baseFolder, PUBLIC_FOLDER);
    console.log("Serving top-level static public files from", serveFolder);
    listener.register(fastifyStatic, {
      root: serveFolder,
      list: false,
      prefix: '/'
    })
    // If port is 0, default to the standard HTTP or HTTPS ports for web servers.
    let host = '0.0.0.0'; // all NICs
    let port = options.https ? 443 : 80;
    // Actually start listening on the port now.
    listenerStart(listener, config.id, host, port);
  } else {
    listener.get('/', (request, reply) => {
      reply.send('You have reached the API server for '+siteCfg.domain)
    })
  }

  // Loop over the listeners and initialize routes.
  await config.forEachSiteAsync (async (site) => {
    let siteCfg = site.getSiteCfg();
    let siteData = site.getSiteData();

    let sslPath = path.join(siteData, 'ssl');
    let options = await getListenerOptions(siteCfg.id, sslPath);
    let listener = await initListener(siteCfg.id, options);

    // Save the fastify listener for easy access.
    siteCfg.listener = listener;
    // Initialize the Fastify REST API endpoints.
    routes.initRoutes(siteCfg);

    // If port is 0, default to the standard HTTP or HTTPS ports for web servers.
    if (siteCfg.port === 0) {
      siteCfg.port = options.https ? 443 : 80;
    }

    // Actually start listening on the port now.
    listenerStart(listener, siteCfg.id, siteCfg.host, siteCfg.port);
    return listener;
  });
}

// Mainline / top-level async function invocation.
(async () => {
  try {
    let server = await serverInit();  // returns a fastify instance
  } catch (e) {
      console.error(e);
  }
})();