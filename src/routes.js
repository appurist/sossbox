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
    if (reply) reply.code(result.statusCode).send(details.description);
  } else {
    let msg = `error ${result.statusCode} on ${result.method}:`;
    log.error(msg);
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
  router.get(prefix + '/ping', (ctx) => {
    ctx.type = JSON_TYPE;
    ctx.body = JSON.stringify({name: store.id, version: packageVersion});
  })
  router.get(prefix + '/status', (ctx) => {
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
  router.get(prefix+'/status', async (ctx) => {
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
      auth.getAuth(ctx.request, store.secret); // ignore the optional result, we're just updating the request for logging

      if (store.data) {
        response.motd = await store.fileGet(store.data, 'motd.md');
      }
      logRoute(ctx.request);

      ctx.type = JSON_TYPE;
      ctx.body = JSON.stringify(response);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`/status: ${err.message}\n${err.stack}`);
      }
      // otherwise reply without the motd
      logRoute(ctx.request);
      response.motd = ''; // make sure it's empty after an exception
      ctx.type = JSON_TYPE;
      ctx.body = JSON.stringify(response);
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

  router.get(prefix+'/users', (ctx) => {
    if (!auth.isAdmin(ctx.request)) {
      logRoute(ctx.request);
      ctx.code = 403;
      ctx.body = JSON.stringify('Forbidden: user is not authorized.');
      return;
    }
    store.folderGet('users').then((response) => {
      if (response) {
        log.warn('/users request');
        ctx.type = JSON_TYPE;
        ctx.body = JSON.stringify(response);
      } else {
        log.warn('/users request, none found.');
        ctx.code = 404;
        ctx.body = 'users folder not found';
      }
    }).catch((err) => {
      handleError(err, ctx.request, ctx.reply);
    });
  })

  // Same as /users/:myID but with an implicit ID
  router.get(prefix+'/profile', async (ctx) => {
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      log.warn({req: ctx.request}, '/profile request, not authorized.');
      ctx.code = 401;
      ctx.body = JSON.stringify('Not authorized.');
      return;
    }
    let userRec = await store.userByUID(user.uid, "meta");
    log.info({req: ctx.request}, 'route handler');
    let response = makeUserResponse(userRec.user);
    ctx.type = JSON_TYPE;
    ctx.body = JSON.stringify(response);
  })

  // Same as /users/:myID but with an implicit ID
  router.put(prefix+'/profile', async (ctx) => {
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      log.warn('/profile request, not authorized');
      ctx.code = 401;
      ctx.body = 'Not authorized.';
      return;
    }
    // TODO: This needs to merge the payload with the current profile data.
    let meta = store.userByUID(user.uid, "meta");
    meta.user = Object.assign({}, meta.user, ctx.request.body);
    await store.userDocReplace(user, '', "meta", meta);
    log.info('/profile PUT');
    ctx.type = JSON_TYPE;
    ctx.body = JSON.stringify(meta.user);
  })

  // This is for a pre-check on the user registration form, to verify that the proposed login ID is available.
  router.head(prefix+'/users/:loginName', (ctx) => {
    let name = ctx.params.loginName;
    store.loginExists(name).then((response) => {
      if (response) {
        ctx.code = 409;
        ctx.body = `That login ID ('${name}') is not available. Please choose another.`;
      } else {
        ctx.code = 200;
        ctx.body = `That login ID ('${name}') is available.`;
      }
      logRoute(ctx.request);
    }).catch((err) => {
      handleError(err, ctx.request, ctx.reply);
    });
  })

  router.get(prefix + '/users/:loginName', (ctx) => {
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      ctx.code = 401;
      ctx.body = 'Not authorized.';
      logRoute(ctx.request);
      return;
    }
    let login = ctx.params.loginName;
    if ((login !== user.login) && !auth.isAdmin(ctx.request)) {
      ctx.code = 403;
      ctx.body = 'Forbidden: user is not authorized.';
      logRoute(ctx.request);
      return;
    }
    store.userByLogin(login).then((userRec) => {
      let response = makeUserResponse(userRec.user);
      ctx.type = JSON_TYPE;
      ctx.body = JSON.stringify(response);
      logRoute(ctx.request);
    }).catch((err) => {
      handleError(err, ctx.request, ctx.reply);
    });
  })

  // This is user add (a.k.a. signup or registration)
  router.post(prefix + '/users', (ctx) => {
    if (!store.registration) {
      if (!store.registration) {
        log.warn('User registration is disabled.');
        ctx.code = 405;
        ctx.body = 'New user registration is disabled.';
        return false;
      }
    }

    let uid = uuid();
    let credentials = { hash: md5(ctx.request.body.password) };
    let user = Object.assign({ uid }, ctx.request.body);
    delete user.password; // don't store the original password. especially not in plain text

    let name = user.login;
    store.loginExists(name).then((response) => {
      if (response) {
        log.warn('User registration: duplicate user.');
        ctx.code = 409;
        ctx.body = `That login ID ('${name}') is not available. Please choose another.`;
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
            log.info('User registration: successful.');
            ctx.type = JSON_TYPE;
            ctx.body = JSON.stringify(response);
          })
          .catch(()=> {
            // This shouldn't be factored in a fall-thru with the above since the above is async, needs to work like an else
            log.error('User registration: failed.');
            ctx.type = JSON_TYPE;
            ctx.body = JSON.stringify(response);
          });
        }).catch((err) => {
          log.error(`User registration failed: ${err.message}`);
          ctx.code = 401;
          ctx.body = 'Registration failed.';
        });
      }
    }).catch(err => {
      handleError(err, ctx.request, ctx.reply);
      return false
    });
  })

  router.delete(prefix+'/users/:uid', (ctx) => {
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      log.warn('User delete, not authorized.');
      ctx.code = 401;
      ctx.body = 'Not authorized.';
      return;
    }
    let uid = ctx.params.uid;
    if ((uid !== user.uid) && !auth.isAdmin(ctx.request)) {
      log.warn('User delete, user not authorized.');
      ctx.code = 403;
      ctx.body = 'Forbidden: user is not authorized.';
      return;
    }
    store.userDelete(uid).then((response) => {
      log.info('User delete complete.');
      ctx.type = JSON_TYPE;
      ctx.body = JSON.stringify(response);
      return;
    }).catch((err) => {
      handleError(err, ctx.request, ctx.reply);
    });
  });

  router.post(prefix + '/login', (ctx) => {
    if (!store.secret) {
      log.error('Login failed, secret is not set.');
      log.error(`${store.id}: secret is not set.`);
      return false;
    }

    store.userByLogin(ctx.request.body.login)
    .then(userRec => {
      let testhash = md5(ctx.request.body.password);
      if (testhash !== userRec.credentials.hash) {
        log.warn('Authentication failed, invalid password.');
        ctx.code = 401;
        ctx.body = 'Authentication failed, invalid password.';
        return;
      }
      let response = makeUserResponse(userRec.user);
      response.token = jwt.sign(response, store.secret, { issuer: store.id})
      // The token does not include more than basic user.
      // e.g. The token does not include itself, or the MOTD message.
      store.fileGet('.', 'motd.md').then(motd => {
        response.motd = motd;
      }).catch(()=> {});
      log.info(`User '${userRec.user.login}' has logged in.`);
      ctx.type = JSON_TYPE;
      ctx.body = JSON.stringify(response);
    }).catch((err) => {
      log.warn('Authentication failed:',err);
      ctx.code = 401;
      ctx.body = 'Authentication failed.';
    });
  });

  router.post(prefix + '/logout', (ctx) => {
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      log.warn("Authorization error during logout.");
      ctx.code(401).send('Not authorized.');
      return;
    }

    let response = { message: 'You have been logged out.', result: 'OK' };
    log.info(`User '${user.login}' has logged out.`);
    ctx.type = JSON_TYPE;
    ctx.body = JSON.stringify(response);
  });

  router.get(prefix + '/projects', async(ctx) => {
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      log.warn("Projects list: Not authorized.");
      ctx.code = 401;
      ctx.body = 'Not authorized.';
      return;
    }

    store.userListDocs(user.uid, 'projects').then((response) => {
      if (response) {
        ctx.type = JSON_TYPE;
        ctx.body = JSON.stringify(response);
      } else {
        log.warn("Projects list: unauthorized path.");
        ctx.code = 401;
        ctx.body = 'Unauthorized path.';
      }
    });
  })

  router.get(prefix + '/projects/:id', async(ctx) => {
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      log.warn("Project info: Not authorized.");
      ctx.code = 401;
      ctx.body = 'Not authorized.';
      return;
    }

    let id = ctx.request.params.id;
    store.userDocGet(user.uid, 'projects', id).then(response => {
      ctx.type = JSON_TYPE
      ctx.body = JSON.stringify(response);
    }).catch((err) => {
      handleError(err, ctx.request, ctx.reply);
    });
  })

  router.post(prefix+'/projects', async (request, reply) => {
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      log.warn("Project POST: not authorized.");
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
      log.warn("Project delete: not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let uid = request.params.uid;
    store.userDocDelete(user.uid, 'projects', uid).then((response) => {
      log.info("Project deleted.");
      reply.type(JSON_TYPE).send(JSON.stringify(response));
      return;
    }).catch((err) => {
      handleError(err, request, reply);
    });
  });

  assets.initRoutes(router, store);
}

module.exports = { initRoutes };
