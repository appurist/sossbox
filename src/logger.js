let level = [ ];
level['trace'] = 10;
level['debug'] = 20;
level['info'] = 30;
level['warn'] = 40;
level['error'] = 50;
level['fatal'] = 60;
level['trace'] = Infinity;

function micros(ms) {
  return Math.round(ms*1000);
}

function userText(arg) {
  let token;
  if (arg.req && arg.req.token) {
    token = arg.req.token;
  } else
  if (arg.res && arg.res.request && arg.res.request.token) {
    token = arg.res.request.token;
  }
  if (!token) return '';

  return token.authenticated ? `user '${token.login}' (${token.uid}) ` : 'unauthenticated ';
}

function report(lvl, arg, arg2) {
  let user = userText(arg);
  if (arg.res) {
    let ch = (arg2 === 'request completed') ? '<' : '-';
    console.info(`${ch} #${arg.res.request.id} ${arg.res.request.method} ${arg.res.request.url} (${arg2}) ${lvl.toUpperCase()}: ${arg.res.request.ip} ${user}[${micros(arg.responseTime)}µs]`);
    return;
  }
  if (arg.req) {
    let ch = (arg2 === 'incoming request') ? '>' : '-';
    console.info(`${ch} #${arg.req.id} ${arg.req.method} ${arg.req.url} (${arg2}) ${lvl.toUpperCase()}: ${arg.req.ip} ${user}`);
    return;
  }

  console.info([arg, arg2, user].join(': '));
}

class Logger { 
  // loglevel can be a string in the level array, or a number directly.
  constructor(loglevel, logfile) {
    this.logfile = logfile;
    this.loglevel = this.numFromLevel(loglevel);
  }

  child(arg) { return this; }

  setlevel(loglevel) {
    this.loglevel = this.numFromLevel(loglevel);
  }

  numFromLevel(loglevel) {
    if (typeof loglevel === 'string') {
      if (level.hasOwnProperty(loglevel)) {
         return level[loglevel];
      }
      return level['warn'];
     }
     return loglevel;
  }

  trace(arg, arg2) { if (this.loglevel >= level['trace']) report('TRACE', arg, arg2); }
  debug(arg, arg2) { if (this.loglevel >= level['debug']) report('DEBUG', arg, arg2); }
  info(arg, arg2) { if (this.loglevel >= level['info']) report('INFO', arg, arg2); }
  warn(arg, arg2) { if (this.loglevel >= level['warn']) report('WARN', arg, arg2); }
  error(arg, arg2) { if (this.loglevel >= level['error']) report('ERROR', arg, arg2); }
  fatal(arg, arg2) { if (this.loglevel >= level['fatal']) report('FATAL', arg, arg2); }
}

module.exports = Logger;