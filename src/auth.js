const jwt = require('jsonwebtoken');

function verifyToken(token, secret) {
  if (!token) {
    log.warn("Missing token.");
    return null;
  }
  let result = jwt.verify(token, secret, function(err, decoded) {
    if (err) {
      log.warn("Error verifying JWT token value:", err.message);
      return null;
    }

    // log.info("Storing user for token:", decoded);
    let user = decoded;
    user.token = token;
    user.authenticated = true;
    return user;
  });
  return result;
}

function getAuth(request, secret) {
  request.token = null;
  if (!request.headers)
    return false;
  if (!request.headers.authorization)
    return false;

  let words = request.headers.authorization.split(' ');
  if (words[0] !== 'Bearer') {
    return false;
  }
  let token = verifyToken(words[1], secret);
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

module.exports = { verifyToken, getAuth, isAdmin };
