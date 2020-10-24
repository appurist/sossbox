// Require the framework and instantiate it
const path = require('path')
const fastify = require('fastify')
const fastifyStatic = require('fastify-static');

const {PUBLIC_FOLDER, KEY_FILE, CRT_FILE} = require('./src/constants')
const io = require('./src/io')
const config = require('./src/config')

const routes = require('./src/routes')

let mainListener = undefined;
let mainSite = undefined;
let staticRoutes = new Set();
let portListeners = { }

function addStaticRoute(port, prefix) {
  staticRoutes.add(`${port},${prefix}`);
}
function isStaticRoute(port, prefix) {
  let result = staticRoutes.has(`${port},${prefix}`);
  return result;
}
function needsListener(port) {
  return !portListeners.hasOwnProperty(port);
}

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

function onError(err) {
  console.error("Server error:", err.message);
  if (err.code === 'EADDRINUSE') {
    console.log(" To continue: Restart this server after changing the indicated port number, or stopping the conflicting service.");
  }
  process.exit(1); //mandatory (as per the Node.js docs)
}

process.on('uncaughtException', onError);
  
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

let rootFolder = process.cwd();

// Returns the fastify instance on success.
async function serverInit() {
  mainSite = await config.init(rootFolder);
  if (!mainSite) {
    console.error("Environment configuration error: ", mainSite);
    return null;
  }

  // Loop over the listeners and initialize routes.
  await config.forEachSiteAsync (async (site) => {
    let sslPath = path.join(site.siteBase, 'ssl');
    site.options = await getListenerOptions(site.id, sslPath);
    // Save the fastify site listener for easy access.
    if (needsListener(site.port)) {
      site.listener = fastify(site.options);
      if (site.siteBase === rootFolder) {
        // for this site (port 0), save as the main listener
        mainListener = site.listener;
      }
    } else {
      site.listener =  portListeners[site.port];
    }

    // Initialize the SOSSBox server REST API endpoints.
    if (site.siteData) {
      routes.initRoutes(site);
    }

    if (site.sitePublic) {
      if (isStaticRoute(site.port, site.prefix)) {
        console.warn(`${site.id}: static files cannot be used with port  specified more than once. '${mainSite.id} already defines one.`)
      } else {
        let isNewListener = needsListener(site.port); // first one?
        console.log(`${site.id}: Serving static files on port ${site.port} at '${site.prefix}' from ${site.sitePublic}`);
        addStaticRoute(site.port, site.prefix);
        let staticOptions = {
          // list: true,
          root: site.sitePublic
        }
        if (site.prefix && site.prefix !== '/') {
          // redirect /prefix to /prefix/ to allow file peers to work
          staticOptions.redirect = true;
          staticOptions.prefix = site.prefix;
        }
        if (!isNewListener) { // not the first one?
          staticOptions.decorateReply = false;
        }
        site.listener.register(fastifyStatic, staticOptions);
        if (isNewListener) {
          portListeners[site.port] = site.listener;
        }
      }
    }

    // If port is 0, just passively use the mainListener.
    if (site !== mainSite) {
      // Actually start listening on the port now.
      listenerStart(site.listener, site.id, site.host, site.port);
    }
    return site.listener;
  });

  /*
  // Top-level site?
  let baseFolder = process.cwd();
  let sslPath = path.join(baseFolder, 'ssl');  
  let options = await getListenerOptions('main', sslPath);
  let port = mainSite.port || options.https ? 443 : 80;
  let host = mainSite.host || '0.0.0.0'; // all NICs

  if (!mainListener) {
    mainListener = await initListener('main', options);
  }
  */

  let port = mainSite.port || (mainSite.options.https ? 443 : 80);
  let host = mainSite.host || '0.0.0.0'; // all NICs
  let id = mainSite.id || 'main';
  let name = mainSite.domain || id;
  if (!isStaticRoute(port, '/')) { // (mainSite) {
    console.log(`Serving default site for port [${port}] at '/'.`);
    mainSite.listener.get('/', (request, reply) => {
      reply.send('You have reached the API server for '+name)
    });
    addStaticRoute(port, '/');
  }

  // console.log(`Static routes:`);
  // staticRoutes.forEach( r => console.log('  '+r))

  // Actually start listening on the port now.
  try {
    listenerStart(mainListener, id, host, port);
  } catch (err) {
    console.error(err.message)
  }
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