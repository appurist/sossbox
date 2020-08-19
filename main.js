// Require the framework and instantiate it
const fs = require('fs')
const path = require('path')

const routes = require('./routes')
const config = require('./config')
if (config.error) {
  console.error("Environment configuration error: ", config.error)
  return 1
} 

// Dump the config to the startup messages.
console.log(`Server branding: '${config.NAME}' (${config.ID}) at ${config.DOMAIN}`);
console.log('New user registration:', config.ALLOW_REGISTER ? 'allowed' : 'disabled');
// console.log(`Data storage: ${config.DATA}`);

const db = require('./datastore')

// db.init is async. We don't really need to wait,
// but the messages come out in order then, so lets.
db.init().then(()=> {
  let keypath = path.resolve(__dirname, 'ssl', 'server.key');
  let crtpath = path.resolve(__dirname,'ssl', 'server.crt');
  
  let options = { logger: false };
  let sslOptions = undefined;
  
  if (fs.existsSync(keypath) && fs.existsSync(crtpath)) {
    let sslkey = fs.readFileSync(keypath);
    let sslcrt = fs.readFileSync(crtpath);
  
    sslOptions = {
      logger: false,
      http2: true,
      https: {
        allowHTTP1: true, // fallback support for HTTP1
        key: sslkey,
        cert: sslcrt
      }
    }
    console.log("Enabled HTTPS via SSL certificate files.");
  } else {
    console.warn("HTTPS disabled: SSL certificate files NOT provided.")
  }
  
  const fastify = require('fastify')(sslOptions || options);
  fastify.register(require('fastify-websocket'));
  // Deal with CORS by enabling it since this is an API for all.
  fastify.register(require('fastify-cors'), { });
  // fastify.options('*', (request, reply) => { reply.send() })

  fastify.setErrorHandler(function (error, request, reply) {
    // Send error response
    console.warn("fastify error handler for ",error);
    let code = 500;
    let message = 'Unknown server error';
    if (error.statusCode)
      code = error.statusCode;
    else
    if (error.message)
      message = error.message;
    reply.code(code).send(message);
  })

  // Initialize the Fastify REST API endpoints.
  routes.init(fastify);
  // Start the server listening.
  fastify.listen(config.PORT, config.HOST, (err) => {
    if (err) {
      console.error(err.message);
      process.exit(1)
    }

    let port = fastify.server.address().port;
    console.log(`Server listening on port ${port}.`);
  })

  fastify.ready(() => {
    // console.log(fastify.printRoutes())
  })
});