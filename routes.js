const uuid = require('uuid-random');
const jwt = require('jsonwebtoken');
const md5 = require('md5');

const db = require('./db');
const config = require('./config');

const JSON_TYPE = 'application/json; charset=utf-8';

// pass null for reply if it should not send the reply automatically
function handleError(err, request, reply) {
  if (!err.requestResult) {
    console.error(err.message);
    if (reply) reply.code(500).send(err.message);
    return;
  }

  let result = err.requestResult;
  if (result.responseContent.errors.length === 1) {
    let details = result.responseContent.errors[0];
    console.error(`error ${result.statusCode} on ${result.method}, ${details.code}: ${details.description}`)
    if (reply) reply.code(result.statusCode).send(details.description);
  } else {
    console.error(`error ${result.statusCode} on ${result.method}:`);
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

let packageVersion = require('./package.json').version;
console.log('SOSSBox '+packageVersion);

function init(fastifyArg) {
  // Declare a route
  fastifyArg.get('/status', (request, reply) => {
    db.fileGet('.', 'motd.md').then(motd => {
      let response = { name: config.STATUS_NAME, version: packageVersion, motd };
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
    })
  })
  fastifyArg.get('/', (request, reply) => {
    reply.send('You have reached the API server for '+config.DOMAIN)
  })

  // support the websocket
  fastifyArg.get('/updates', { websocket: true }, (connection, req) => {
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

  fastifyArg.get('/users', (request, reply) => {
    db.folderGet('users').then((response) => {
      if (response) {
        reply.type(JSON_TYPE).send(JSON.stringify(response));    
      } else {
        reply.code(404).send('users folder not found')
      }
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  })


  // Same as /users/:myID but with an implicit ID
  fastifyArg.put('/profile', async (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      reply.code(401).send('Not authorized.');
      return;
    }
    // TODO: This needs to merge the payload with the current profile data.
    let meta = userDocGet(user, '', "meta");
    let oldUser = meta.user;
    meta.user = Object.assign({}, oldUser, request.body);
    await userDocReplace(user, '', "meta", meta);
    reply.type(JSON_TYPE).send(JSON.stringify(meta));    
  })

  fastifyArg.get('/users/:loginName', (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      reply.code(401).send('Not authorized.');
      return;
    }
    let login = request.params.loginName;
    if ((login !== user.login) && !user.administrator) {
      reply.code(401).send('Not authorized.');
      return;
    }
    db.userByLogin(login).then((response) => {
      reply.type(JSON_TYPE).send(JSON.stringify(response.user));    
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  })

  // This is user add (a.k.a. signup or registration)
  fastifyArg.post('/users', (request, reply) => {
    let uid = uuid();
    let credentials = { hash: md5(request.body.password) };
    let user = Object.assign({ uid }, request.body);
    delete user.password; // don't store the original password. especially not in plain text

    if (!config.ALLOW_REGISTER) {
      reply.code(401).send('New user registration is disabled.');
      return false;
    }

    // Next, create user with key from tenant db.
    // Returns the server key (.secret member is the db token).
    db.userCreate(credentials, user)
    .then(response => {
      let user = response.user;
      reply.type(JSON_TYPE).send(JSON.stringify(user));
    }).catch(err => { 
      handleError(err, request, reply);
    });
  })

  fastifyArg.delete('/users/:uid', (request, reply) => {
    let uid = request.params.uid;
    db.userDelete(uid).then((response) => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
      return;
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  });

  fastifyArg.post('/login', (request, reply) => {
    if (!config.JWT_SECRET) {
      console.error("JWT_SECRET is not set.");
      return false;
    }

    db.userByLogin(request.body.login)
    .then(userRec => {
      let testhash = md5(request.body.password);
      if (testhash !== userRec.credentials.hash) {
        reply.code(401).send('Authentication failed, invalid password.');
        return;
      }
      db.fileGet('.', 'motd.md').then(motd => {
        let response = Object.assign({ }, userRec.user, { motd })
        response.token = jwt.sign(response, config.JWT_SECRET, { issuer: config.STATUS_NAME})
        reply.type(JSON_TYPE).send(JSON.stringify(response));    
      })
    }).catch((err) => {
      reply.code(401).send('Authentication failed.');
    });
  });

  fastifyArg.post('/logout', (request, reply) => {
    let response = { message: 'You have been logged out.', result: 'OK' };
    reply.type(JSON_TYPE).send(JSON.stringify(response));    
  });

  function verifyToken(token) {
    let result = jwt.verify(token, config.JWT_SECRET, function(err, decoded) {
      if (err) {
        console.error(err);
        return null;
      }

      console.log("Storing user for token:", decoded);
      let user = decoded;
      user.token = token;
      user.authenticated = true;
      return user;
    });

    return result;
  }

  function getAuth(request) {
    if (!request.headers.hasOwnProperty('authorization'))
      return false;

    let words = request.headers.authorization.split(' ');
    return (words[0] === 'Bearer') ? verifyToken (words[1]) : false;
  }

  fastifyArg.get('/projects', async (request, reply) => {
    let user = getAuth(request);
    if (!user) {
      reply.code(401).send('Not authorized.');
      return;
    }

    db.userListDocs(user.uid, 'projects').then((response) => {
      if (response) {
        reply.type(JSON_TYPE).send(JSON.stringify(response));
      } else {
        reply.code(401).send('Unauthorized path.');
      }
    });
  })

  fastifyArg.get('/projects/:id', async (request, reply) => {
    let user = await getAuth(request);
    if (!user) {
      reply.code(401).send('Not authorized.');
      return;
    }

    let id = request.params.id;
    db.userDocGet(user.uid, 'projects', id).then(response => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));    
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  })

  fastifyArg.post('/projects', async (request, reply) => {
    let user = await getAuth(request);
    if (!user) {
      reply.code(401).send('Not authorized.');
      return;
    }


    let uid = request.body.uid || uuid();
    let proj = Object.assign({ uid }, request.body);

    // Next, create user with key from tenant db.
    // Returns the server key (.secret member is the db token).
    db.userDocCreate(user.uid, 'projects', uid, proj)
    .then(response => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));
    }).catch(err => { 
      handleError(err, request, reply);
    });
  })

  fastifyArg.delete('/projects/:uid', async (request, reply) => {
    let user = await getAuth(request);
    if (!user) {
      reply.code(401).send('Not authorized.');
      return;
    }

    let uid = request.params.uid;
    db.userDocDelete(user.uid, 'projects', uid).then((response) => {
      reply.type(JSON_TYPE).send(JSON.stringify(response));
      return;
    }).catch((err) => { 
      handleError(err, request, reply);
    });
  });

  // Add a hook for logging.
  /*
  fastifyArg.addHook('onResponse', (request, reply, next) => {
    let req = request.req;
    let res = reply.res;
    // console.log(`Request from ${req.ip} for ${req.method} ${req.url}: ${res.statusCode} ${res.statusMessage}`);
    next();
  })
  */
}

module.exports = { init };
