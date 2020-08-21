// Require the framework and instantiate it
const path = require('path')
const fastify = require('fastify')

const storage = require('./storage')
const config = require('./config')
const routes = require('./routes')

const KEY_FILE = 'server.key'
const CRT_FILE = 'server.crt'

let serverCfg = undefined;

// Returns the fastify instance on success.
async function serverInit() {
  serverCfg = await config.init();
  if (!serverCfg) {
    console.error("Environment configuration error: ", serverCfg);
    return null;
  }

  // Loop over the listeners and initialize routes.
  await config.forEachSiteAsync (async (siteCfg) => {
    // Dump the config to the startup messages.
    console.log(`Server branding: '${siteCfg.name}' (${siteCfg.id}) at ${siteCfg.domain}`);
    console.log('New user registration:', siteCfg.register ? 'allowed' : 'disabled');
    console.log(`Data storage: ${siteCfg.folder}`);
    
    let options = { logger: false };
    let sslOptions = undefined;

    let sslPath = path.resolve(siteCfg.folder, 'ssl');
    let keyExists = await storage.fileExists(sslPath, KEY_FILE)
    let crtExists = await storage.fileExists(sslPath, CRT_FILE)
    
    if (keyExists && crtExists) {
      let sslkey = await storage.fileGet(sslPath, KEY_FILE)
      let sslcrt = await storage.fileGet(sslPath, CRT_FILE)
    
      sslOptions = {
        logger: false,
        http2: true,
        https: {
          allowHTTP1: true, // fallback support for HTTP1
          key: sslkey,
          cert: sslcrt
        }
      }
      console.log(`${siteCfg.id}: Enabled HTTPS via SSL certificate files.`);
    } else {
      console.warn(`${siteCfg.id}: HTTP only. HTTPS disabled. (SSL certificate files NOT provided.)`);
    }
    
    // 'listener' is a Fastify instance. 'siteCfg' is the configuration object.
    const listener = fastify(sslOptions || options);
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

    // Save the fastify listener for easy access.
    siteCfg.listener = listener;
    // Initialize the Fastify REST API endpoints.
    routes.initRoutes(siteCfg);
  
    // Start the server listening.
    listener.listen(siteCfg.port, siteCfg.host, (err) => {
      if (err) {
        console.error(err.message);
        process.exit(1)
      }
  
      let port = listener.server.address().port;
      console.log(`${siteCfg.id}: listening on port ${port}.`);
    })
  
    /*
    listener.ready(() => {
      console.log(listener.printRoutes())
    })
    */

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