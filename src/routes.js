const uuid = require('uuid-random');
const jwt = require('jsonwebtoken');
const md5 = require('md5');

const assets = require('./assets');
const auth = require('./auth');
const log = require('./log');

const JSON_TYPE = 'application/json; charset=utf-8';

function logRoute(req, err) {
  req.log.info({req, err}, 'route handler');
}

// pass null for reply if it should not send the reply automatically
let first = true;
function handleError(err, request, reply) {
  if (!err.requestResult) {
    log.error(err.message);
    logRoute(request, err);
    if (reply) {
      reply.code(500).send(err.message);
    }
    return;
  }

  let result = err.requestResult;
  if (result.responseContent.errors.length === 1) {
    let details = result.responseContent.errors[0];
    let msg = `error ${result.statusCode} on ${result.method}, ${details.code}: ${details.description}`;
    log.error(msg);
    request.log.error(msg);
    if (reply) reply.code(result.statusCode).send(details.description);
  } else {
    let msg = `error ${result.statusCode} on ${result.method}:`;
    log.error(msg);
    request.log.error(msg);
    let firstCode = null;
    let firstText = null;
    for (let details of result.responseContent.errors) {
      log.warn(`  ${details.code}: ${details.description}`);
      if (!first) {
        firstCode = details.code;
        firstText = details.description;
      }
    }
    firstCode = firstCode || result.statusCode || 500;
    firstText = firstText || err.message || `unknown error on ${request.method}`;
    console.error(`Error ${firstCode}: ${firstText}`);
    if (reply) {
      // reply.code(firstCode).send(firstText);
      throw err;
    }
  }
}

let packageVersion = require('../package.json').version;
log.force('SOSSData '+packageVersion);
// log.info('Node.js '+process.version);

// This initializes the SOSS routes, and optionally user registration if store.registration is set.
function initRoutes(router, store) {
  function makeUserResponse(user) {
    let response = Object.assign({ }, user)
    response.administrator = (response.login === store.admin) || (response.uid === store.admin);
    return response;
  }

  // Declare a route
  let prefix = (store.api === '/') ? '' : store.api;  // store '/' as an empty string for concatenation
  // log.info(`${store.id}: Enabling storage API ...`)
  router.get(prefix + '/ping', (ctx, next) => {
    ctx.type = JSON_TYPE;
    ctx.body = JSON.stringify({name: store.id, version: packageVersion});
  })
  router.get(prefix + '/status', (ctx, next) => {
    ctx.type = JSON_TYPE;
    let response = {
      version: packageVersion,
      id: store.id,
      name: store.name,
      domain: store.domain,
      registration: store.registration,
      motd: ''
    };
    ctx.body = JSON.stringify(response);
  })
  router.get(prefix+'/status', async (request, reply) => {
    let response = {
      version: packageVersion,
      id: store.id,
      name: store.name,
      domain: store.domain,
      registration: store.registration,
      motd: ''
    };
    try {
      ctx.type = JSON_TYPE;
      auth.getAuth(request, store.secret); // ignore the optional result, we're just updating the request for logging

      if (store.data) {
        response.motd = await store.fileGet(store.data, 'motd.md');
      }
      logRoute(request);

      reply.type(JSON_TYPE).send(JSON.stringify(response));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`/status: ${err.message}\n${err.stack}`);
      }
      // otherwise reply without the motd
      logRoute(request);
      response.motd = ''; // make sure it's empty after an exception
      reply.type(JSON_TYPE).send(JSON.stringify(response));
    }
  })

  // support the websocket
  // router.get(prefix + '/updates', (connection) => { // { websocket: true },
  //   log.info("socket connected.");
  //   connection.socket.on('message', (message) => {
  //     if (message.startsWith('user,')) {
  //       log.info("socket message: user,***");
  //     } else {
  //       log.info("socket message: "+JSON.stringify(message));
  //     }
  //     connection.socket.send('{ "message": "none"}');
  //   })
  //   connection.socket.on('open', (connection, ev) => {
  //     log.info("socket connected: "+JSON.stringify(connection)+' '+JSON.stringify(ev));
  //   })
  //   connection.socket.on('close', (code, reason) => {
  //     log.info("socket disconnected: "+JSON.stringify(code)+' '+JSON.stringify(reason));
  //   })
  // })

  router.get(prefix+'/users', (request, reply) => {
    if (!auth.isAdmin(request)) {
      logRoute(request);
      reply.code(403).send('Forbidden: user is not authorized.');
      return;
    }
    store.folderGet('users').then((response) => {
      if (response) {
        request.log.warn('/users request');
        reply.type(JSON_TYPE).send(JSON.stringify(response));
      } else {
        request.log.warn('/users request, none found.');
        reply.code(404).send('users folder not found')
      }
    }).catch((err) => {
      handleError(err, request, reply);
    });
  })

  // Same as /users/:myID but with an implicit ID
  router.get(prefix+'/profile', async (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn({req: request}, '/profile request, not authorized.');
      reply.code(401).send('Not authorized.');
      return;
    }
    let userRec = await store.userByUID(user.uid, "meta");
    request.log.info({req: request}, 'route handler');
    let response = makeUserResponse(userRec.user);
    reply.type(JSON_TYPE).send(JSON.stringify(response));
  })

  // Same as /users/:myID but with an implicit ID
  router.put(prefix+'/profile', async (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn('/profile request, not authorized');
      reply.code(401).send('Not authorized.');
      return;
    }
    // TODO: This needs to merge the payload with the current profile data.
    let meta = store.userByUID(user.uid, "meta");
    meta.user = Object.assign({}, meta.user, request.body);
    await store.userDocReplace(user, '', "meta", meta);
    request.log.info('/profile PUT');
    reply.type(JSON_TYPE).send(JSON.stringify(meta.user));
  })

  // This is for a pre-check on the user registration form, to verify that the proposed login ID is available.
  router.head(prefix+'/users/:loginName', (request, reply) => {
    let name = request.params.loginName;
    store.loginExists(name).then((response) => {
      if (response) {
        reply.code(409).send(`That login ID ('${name}') is not available. Please choose another.`);
      } else {
        reply.code(200).send(`That login ID ('${name}') is available.`);
      }
      logRoute(request);
    }).catch((err) => {
      handleError(err, request, reply);
    });
  })

  router.get(prefix+'/users/:loginName', (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      reply.code(401).send('Not authorized.');
      logRoute(request);
      return;
    }
    let login = request.params.loginName;
    if ((login !== user.login) && !auth.isAdmin(request)) {
      reply.code(403).send('Forbidden: user is not authorized.');
      logRoute(request);
      return;
    }
    store.userByLogin(login).then((userRec) => {
      let response = makeUserResponse(userRec.user);
      reply.type(JSON_TYPE).send(JSON.stringify(response));
      logRoute(request);
    }).catch((err) => {
      handleError(err, request, reply);
    });
  })

  // This is user add (a.k.a. signup or registration)
  router.post(prefix+'/users', (request, reply) => {
    if (!store.registration) {
      if (!store.registration) {
        request.log.warn('User registration is disabled.');
        reply.code(405).send('New user registration is disabled.');
        return false;
      }
    }

    let uid = uuid();
    let credentials = { hash: md5(request.body.password) };
    let user = Object.assign({ uid }, request.body);
    delete user.password; // don't store the original password. especially not in plain text

    let name = user.login;
    store.loginExists(name).then((response) => {
      if (response) {
        request.log.warn('User registration: duplicate user.');
        reply.code(409).send(`That login ID ('${name}') is not available. Please choose another.`);
        return false;
      } else {
        // Next, create user with key from tenant storage.
        // Returns the server key (.secret member is the storage token).
        store.userCreate(credentials, user)
        .then(data => {
          let userRec = data.user;
          let response = makeUserResponse(userRec.user);
          response.token = jwt.sign(userRec, store.secret, { issuer: store.id})
          // The token does not include more than basic user.
          // e.g. The token does not include itself, or the MOTD message.
          store.fileGet('.', 'motd.md').then(motd => {
            response.motd = motd;
            request.log.info('User registration: successful.');
            reply.type(JSON_TYPE).send(JSON.stringify(response));
          })
          .catch(()=> {
            // This shouldn't be factored in a fall-thru with the above since the above is async, needs to work like an else
            request.log.error('User registration: failed.');
            reply.type(JSON_TYPE).send(JSON.stringify(response));
          });
        }).catch((err) => {
          request.log.error(`User registration failed: ${err.message}`);
          reply.code(401).send('Registration failed.');
        });
      }
    }).catch(err => {
      handleError(err, request, reply);
      return false
    });
  })

  router.delete(prefix+'/users/:uid', (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn('User delete, not authorized.');
      reply.code(401).send('Not authorized.');
      return;
    }
    let uid = request.params.uid;
    if ((uid !== user.uid) && !auth.isAdmin(request)) {
      request.log.warn('User delete, user not authorized.');
      reply.code(403).send('Forbidden: user is not authorized.');
      return;
    }
    store.userDelete(uid).then((response) => {
      request.log.info('User delete complete.');
      reply.type(JSON_TYPE).send(JSON.stringify(response));
      return;
    }).catch((err) => {
      handleError(err, request, reply);
    });
  });

  router.post(prefix+'/login', (request, reply) => {
    if (!store.secret) {
      request.log.error('Login failed, secret is not set.');
      log.error(`${store.id}: secret is not set.`);
      return false;
    }

    store.userByLogin(request.body.login)
    .then(userRec => {
      let testhash = md5(request.body.password);
      if (testhash !== userRec.credentials.hash) {
        request.log.warn('Authentication failed, invalid password.');
        reply.code(401).send('Authentication failed, invalid password.');
        return;
      }
      let response = makeUserResponse(userRec.user);
      response.token = jwt.sign(response, store.secret, { issuer: store.id})
      // The token does not include more than basic user.
      // e.g. The token does not include itself, or the MOTD message.
      store.fileGet('.', 'motd.md').then(motd => {
        response.motd = motd;
      }).catch(()=> {});
      request.log.info(`User '${userRec.user.login}' has logged in.`);
      reply.type(JSON_TYPE).send(JSON.stringify(response));
    }).catch((err) => {
      request.log.warn('Authentication failed:',err);
      reply.code(401).send('Authentication failed.');
    });
  });

  router.post(prefix+'/logout', (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn("Authorization error during logout.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let response = { message: 'You have been logged out.', result: 'OK' };
    request.log.info(`User '${user.login}' has logged out.`);
    reply.type(JSON_TYPE).send(JSON.stringify(response));
  });

  router.get(prefix+'/projects', async (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn("Projects list: Not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    store.userListDocs(user.uid, 'projects').then((response) => {
      if (response) {
        reply.type(JSON_TYPE).send(JSON.stringify(response));
      } else {
        request.log.warn("Projects list: unauthorized path.");
        reply.code(401).send('Unauthorized path.');
      }
    });
  })

  router.get(prefix+'/projects/:id', async (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn("Project info: Not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let id = request.params.id;
    store.userDocGet(user.uid, 'projects', id).then(response => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));
    }).catch((err) => {
      handleError(err, request, reply);
    });
  })

  router.post(prefix+'/projects', async (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn("Project POST: not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let uid = request.body.uid || uuid();
    let proj = Object.assign({ uid }, request.body);

    // Next, create user with key from tenant storage.
    // Returns the server key (.secret member is the storage token).
    store.userDocCreate(user.uid, 'projects', uid, proj)
    .then(response => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));
    }).catch(err => {
      handleError(err, request, reply);
    });
  })

  router.delete(prefix+'/projects/:uid', async (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      request.log.warn("Project delete: not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let uid = request.params.uid;
    store.userDocDelete(user.uid, 'projects', uid).then((response) => {
      request.log.info("Project deleted.");
      reply.type(JSON_TYPE).send(JSON.stringify(response));
      return;
    }).catch((err) => {
      handleError(err, request, reply);
    });
  });

  assets.initRoutes(router, store);
}

module.exports = { initRoutes };
