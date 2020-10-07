// Require the framework and instantiate it
const path = require('path')
const fastify = require('fastify')
const fastifyStatic = require('fastify-static');

const io = require('./src/io')
const config = require('./src/config')

const routes = require('./src/routes')

const KEY_FILE = 'server.key'
const CRT_FILE = 'server.crt'
const PUBLIC_FOLDER = 'public'

let serverCfg = undefined;
let mainListener = undefined;
let mainSite = undefined;
let mainRoutes = new Set();

// Returns the SSL or non-SSL related options
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
    console.warn(`${id}: error handler for`,error);
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

  // dump routes at startup?
  if (process.argv.includes('--dump')) {
    console.warn(`Routes for '${id}'on port ${port}:`)
    listener.ready(() => { console.log(listener.printRoutes()) })
  }
}

// Returns the fastify instance on success.
async function serverInit() {
  serverCfg = await config.init();
  if (!serverCfg) {
    console.error("Environment configuration error: ", serverCfg);
    return null;
  }

  // Loop over the listeners and initialize routes.
  await config.forEachSiteAsync (async (site) => {
    let siteCfg = site.getSiteCfg();
    let siteData = site.getSiteData();
    let basePath = site.getSitePath();

    if (siteCfg.port !== 0) {
      let sslPath = path.join(siteData, 'ssl');
      let options = await getListenerOptions(siteCfg.id, sslPath);
      // Save the fastify site listener for easy access.
      siteCfg.listener = await initListener(siteCfg.id, options);
    } else {
      // for this site, reuse the main listener
      let baseFolder = basePath;
      let sslPath = path.join(baseFolder, 'ssl');  
      let options = await getListenerOptions(siteCfg.id, sslPath);
   
      mainListener = await initListener(siteCfg.id, options);
      console.log("Serving top-level static public files from", path.join(baseFolder, PUBLIC_FOLDER));
      siteCfg.listener = mainListener;
    }

    // Initialize the Fastify REST API endpoints.
    routes.initRoutes(siteCfg);

    // now support serving static files, e.g. a "public" folder, if specified.
    if (siteCfg.public) {
      let prefix = siteCfg.prefix || '/'+siteCfg.id;
      if (siteCfg.port === 0 && mainRoutes.has(prefix)) {  // (siteCfg.port === 0 && mainSite) {
        console.error(`${siteCfg.id}: public static files cannot be used with port 0 specified more than once. '${mainSite.id} already defines one.`)
      } else {
        let serveFolder = path.join(basePath, siteCfg.public);
        console.log(`Serving static files on [${siteCfg.port}] at '${prefix}' from ${serveFolder}`);
        mainRoutes.add(prefix);
        siteCfg.listener.register(fastifyStatic, {
          root: serveFolder,
          list: true,
          prefix: prefix,
          redirect: true,  // redirect /prefix to /prefix/ to allow file peers to work
          decorateReply: (mainRoutes.size <= 1) // first one?
        })
        mainSite = siteCfg;
      }
    }

    // If port is 0, just passively use the mainListener.
    if (siteCfg.port !== 0) {
      // Actually start listening on the port now.
      listenerStart(siteCfg.listener, siteCfg.id, siteCfg.host, siteCfg.port);
    }
    return siteCfg.listener;
  });

  // Top-level site?
  let baseFolder = process.cwd();
  let serveFolder = path.join(baseFolder, PUBLIC_FOLDER);
  let sslPath = path.join(baseFolder, 'ssl');  
  let options = await getListenerOptions('main', sslPath);
  let port = options.https ? 443 : 80;
  let host = '0.0.0.0'; // all NICs
  if (io.folderExists(baseFolder, PUBLIC_FOLDER)) {
    let prefix = '/';
    if (mainRoutes.has(prefix)) { // (mainSite) {
      console.error(`main: public static files ignored, cannot be used when '${mainSite.id} already defines one.`)
    }
    
    if (!mainListener) {
      mainListener = await initListener('main', options);
      console.log("Serving top-level static public files from", serveFolder);
    }
    
    mainRoutes.add(prefix);
    // If port is 0, default to the standard HTTP or HTTPS ports for web servers.
    mainListener.register(fastifyStatic, {
      root: serveFolder,
      list: false,
      prefix
    })
  } else {
    if (!mainSite) {
      console.log(`Default for ${mainListener.port}:`,'/')
      console.log(`Serving static files on [${port}] at '/' from ${serveFolder}`);
      mainRoutes.add('/');
      mainListener.get('/', (request, reply) => {
        reply.send('You have reached the API server for '+siteCfg.domain)
      });
    }
  }

  console.log(`Top-level routes on port ${port}:`);
  mainRoutes.forEach( r => console.log(' '+r))

  // Actually start listening on the port now.
  listenerStart(mainListener, 'main', host, port);
  return mainListener;
}

// Mainline / top-level async function invocation.
(async () => {
  try {
    await serverInit();  // returns a fastify instance
  } catch (e) {
    console.error(e);
  }
})();