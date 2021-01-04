const uuid = require('uuid-random');
const jwt = require('jsonwebtoken');
const md5 = require('md5');

const fastifyWebsocket = require('fastify-websocket');

const JSON_TYPE = 'application/json; charset=utf-8';

function logRoute(req, err) {
  req.log.info({req, err}, 'route handler');
}

// pass null for reply if it should not send the reply automatically
function handleError(err, request, reply) {
  if (!err.requestResult) {
    console.error(err.message);
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
    console.error(msg);
    request.log.error(msg);
    if (reply) reply.code(result.statusCode).send(details.description);
  } else {
    let msg = `error ${result.statusCode} on ${result.method}:`;
    console.error(msg);
    request.log.error(msg);
    let firstCode = null;
    let firstText = null;
    for (let details of result.responseContent.errors) {
      console.warn(`  ${details.code}: ${details.description}`);
      if (!first) {
        firstCode = details.code;
        firstText = details.description;
      }
    }
    if (reply) {
      firstCode = firstCode || result.statusCode || 500;
      firstText = firstText || err.message || `unknown error on ${request.method}`;
      // reply.code(firstCode).send(firstText);
      throw err;
    }
  }
}

let packageVersion = require('../package.json').version;
console.log('SOSSBox '+packageVersion);
// console.log('Node.js '+process.version);

// This initializes the SOSS routes, and optionally user registration if siteCfg.registration is set.
function initRoutes(site) {
  let listener = site.listener;

  listener.register(fastifyWebsocket);

  // some nested functions so we have siteCfg and mySite
  function verifyToken(token) {
    if (!token) {
      console.warn("Missing token.");
      return null;
    }
    let result = jwt.verify(token, site.secret, function(err, decoded) {
      if (err) {
        console.warn("Error verifying JWT token value:", err.message);
        return null;
      }
  
      // console.log("Storing user for token:", decoded);
      let user = decoded;
      user.token = token;
      user.authenticated = true;
      return user;
    });
    return result;
  }
  
  function getAuth(request) {
    request.token = null;
    if (!request.headers.hasOwnProperty('authorization'))
      return false;
  
    let words = request.headers.authorization.split(' ');
    if (words[0] !== 'Bearer') {
      return false;
    }
    let token = verifyToken(words[1]);
    if (!token) {
      return false;
    }

    // Update the request for user context.
    request.token = token;
    return token;
  }
  
  function isAdmin(request) {
    let user = getAuth(request);
    return user && user.administrator;
  }
    
  // Declare a route
  let prefix = (site.prefix === '/') ? '' : site.prefix;  // store '/' as an empty string for concatenation
  // console.log(`${site.id}: Enabling storage API ...`)
  listener.get(prefix+'/ping', async (request, reply) => {
    try {
      reply.type(JSON_TYPE).send(JSON.stringify({sossbox: site.id}));    
    } catch (err) {
      handleError(err, request, reply);
    }
  })
  listener.get(prefix+'/status', async (request, reply) => {
    getAuth(request); // ignore the optional result, we're just updating the request for logging

    let response = {
      version: packageVersion,
      id: site.id,
      name: site.name,
      domain: site.domain,
      registration: site.registration,
      motd: ''
    };
    try {
      if (site.siteData) {
        response.motd = await site.fileGet(site.siteData, 'motd.md');
      }
      logRoute(request);
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error("MOTD:", site.id, err);
      }
      // otherwise reply without the motd
      logRoute(request);
      response.motd = ''; // make sure it's empty after an exception
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
    }
  })

  // support the websocket
  listener.get(prefix+'/updates', { websocket: true }, (connection, req) => {
    console.log("socket connected.");
    connection.socket.on('message', (message) => {
      if (message.startsWith('user,')) {
        console.log("socket message: user,***");
      } else {
        console.log("socket message:", message);
      }
      connection.socket.send('{ "message": "none"}');
    })
    connection.socket.on('open', (connection, ev) => {
      console.log("socket connected:", connection, ev);
    })
    connection.socket.on('close', (code, reason) => {
      console.log("socket disconnected:", code, reason);
    })
  })  

  listener.get(prefix+'/users', (request, reply) => {
    if (!isAdmin(request)) {
      logRoute(request);
      reply.code(403).send('Forbidden: user is not authorized.');
      return;
    }
    site.folderGet('users').then((response) => {
      if (response) {
        request.log.warning('/users request');
        reply.type(JSON_TYPE).send(JSON.stringify(response));    
      } else {
        request.log.warning('/users request, none found.');
        reply.code(404).send('users folder not found')
      }
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  })

  // Same as /users/:myID but with an implicit ID
  listener.get(prefix+'/profile', async (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      request.log.warning({req: request}, '/profile request, not authorized.');
      reply.code(401).send('Not authorized.');
      return;
    }
    let meta = await site.userByUID(user.uid, "meta");
    request.log.info({req: request}, 'route handler');
    reply.type(JSON_TYPE).send(JSON.stringify(meta.user));    
  })

  // Same as /users/:myID but with an implicit ID
  listener.put(prefix+'/profile', async (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      request.log.warn('/profile request, not authorized');
      reply.code(401).send('Not authorized.');
      return;
    }
    // TODO: This needs to merge the payload with the current profile data.
    let meta = site.userByUID(user.uid, "meta");
    meta.user = Object.assign({}, meta.user, request.body);
    await userDocReplace(user, '', "meta", meta);
    request.log.info('/profile PUT');
    reply.type(JSON_TYPE).send(JSON.stringify(meta.user));    
  })

  // This is for a pre-check on the user registration form, to verify that the proposed login ID is available.
  listener.head(prefix+'/users/:loginName', (request, reply) => {
    let name = request.params.loginName;
    site.loginExists(name).then((response) => {
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

  listener.get(prefix+'/users/:loginName', (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      reply.code(401).send('Not authorized.');
      logRoute(request);
      return;
    }
    let login = request.params.loginName;
    if ((login !== user.login) && !isAdmin(request)) {
      reply.code(403).send('Forbidden: user is not authorized.');
      logRoute(request);
      return;
    }
    site.userByLogin(login).then((response) => {
      reply.type(JSON_TYPE).send(JSON.stringify(response.user));    
      logRoute(request);
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  })

  // This is user add (a.k.a. signup or registration)
  listener.post(prefix+'/users', (request, reply) => {
    if (!site.registration) {
      if (!site.registration) {
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
    site.loginExists(name).then((response) => {
      if (response) {
        request.log.warn('User registration: duplicate user.');
        reply.code(409).send(`That login ID ('${name}') is not available. Please choose another.`);
        return false;
      } else {
        // Next, create user with key from tenant storage.
        // Returns the server key (.secret member is the storage token).
        site.userCreate(credentials, user)
        .then(data => {
          let userRec = data.user;
          let response = Object.assign({ }, userRec)
          response.token = jwt.sign(userRec, site.secret, { issuer: site.id})
          // The token does not include more than basic user.
          // e.g. The token does not include itself, or the MOTD message.
          site.fileGet('.', 'motd.md').then(motd => {
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
          request.log.error('User registration: create failed.');
          reply.code(401).send('Registration failed.');
        });
      }
    }).catch(err => { 
      handleError(err, request, reply);
      return false
    });
  })

  listener.delete(prefix+'/users/:uid', (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      request.log.warn('User delete, not authorized.');
      reply.code(401).send('Not authorized.');
      return;
    }
    let uid = request.params.uid;
    if ((uid !== user.uid) && !isAdmin(request)) {
      request.log.warn('User delete, user not authorized.');
      reply.code(403).send('Forbidden: user is not authorized.');
      return;
    }
    site.userDelete(uid).then((response) => {
      request.log.info('User delete complete.');
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
      return;
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  });

  listener.post(prefix+'/login', (request, reply) => {
    if (!site.secret) {
      request.log.error('Login failed, secret is not set.');
      console.error(`${site.id}: secret is not set.`);
      return false;
    }

    site.userByLogin(request.body.login)
    .then(userRec => {
      let testhash = md5(request.body.password);
      if (testhash !== userRec.credentials.hash) {
        request.log.warn('Authentication failed, invalid password.');
        reply.code(401).send('Authentication failed, invalid password.');
        return;
      }
      let response = Object.assign({ }, userRec.user)
      response.token = jwt.sign(userRec.user, site.secret, { issuer: site.id})
      // The token does not include more than basic user.
      // e.g. The token does not include itself, or the MOTD message.
      site.fileGet('.', 'motd.md').then(motd => {
        response.motd = motd;
      }).catch(()=> {});
      request.log.info(`User '${userRec.user.login}' has logged in.`);
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
    }).catch((err) => {
      request.log.warn('Authentication failed.');
      reply.code(401).send('Authentication failed.');
    });
  });

  listener.post(prefix+'/logout', (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      request.log.warn("Authorization error during logout.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let response = { message: 'You have been logged out.', result: 'OK' };
    request.log.info(`User '${user.login}' has logged out.`);
    reply.type(JSON_TYPE).send(JSON.stringify(response));    
  });

  listener.get(prefix+'/projects', async (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      request.log.warn("Projects list: Not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    site.userListDocs(user.uid, 'projects').then((response) => {
      if (response) {
        reply.type(JSON_TYPE).send(JSON.stringify(response));
      } else {
        request.log.warn("Projects list: unauthorized path.");
        reply.code(401).send('Unauthorized path.');
      }
    });
  })

  listener.get(prefix+'/projects/:id', async (request, reply) => {
    let user = await getAuth(request);
    if (!user) {
      request.log.warn("Project info: Not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let id = request.params.id;
    site.userDocGet(user.uid, 'projects', id).then(response => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  })

  listener.post(prefix+'/projects', async (request, reply) => {
    let user = await getAuth(request);
    if (!user) {
      request.log.warn("Project POST: not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let uid = request.body.uid || uuid();
    let proj = Object.assign({ uid }, request.body);

    // Next, create user with key from tenant storage.
    // Returns the server key (.secret member is the storage token).
    site.userDocCreate(user.uid, 'projects', uid, proj)
    .then(response => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));
    }).catch(err => { 
      handleError(err, request, reply);
    });
  })

  listener.delete(prefix+'/projects/:uid', async (request, reply) => {
    let user = await getAuth(request);
    if (!user) {
      request.log.warn("Project delete: not authorized.");
      reply.code(401).send('Not authorized.');
      return;
    }

    let uid = request.params.uid;
    site.userDocDelete(user.uid, 'projects', uid).then((response) => {
      request.log.info("Project deleted.");
      reply.type(JSON_TYPE).send(JSON.stringify(response));
      return;
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  });
}

module.exports = { initRoutes };
