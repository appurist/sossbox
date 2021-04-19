const simpleLogger = require('simple-node-logger');

let levels = [ ];
levels['trace'] = 10;
levels['debug'] = 20;
levels['info'] = 30;
levels['warn'] = 40;
levels['error'] = 50;
levels['fatal'] = 60;
levels['trace'] = Infinity;

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

class Logger { 
  // loglevel must be a normal loglevel string from the levels array above.
  constructor(_loglevel, _logfile) {
    this.logfile = _logfile;
    this.level = _loglevel;
    this.levelNum = this.numFromLevel(_loglevel);
    let options = { level: _loglevel, loggerConfigFile: _logfile}
    this.log = simpleLogger.createSimpleLogger(options);
    this.log.setLevel(_loglevel);
  }

  child(arg) { return this; }

  setlevel(_loglevel) {
    this.level = _loglevel;
    this.levelNum = this.numFromLevel(_loglevel);
    this.log.setLevel(_loglevel);
  }

  numFromLevel(loglevel) {
    if (typeof loglevel === 'string') {
      if (levels.hasOwnProperty(loglevel)) {
         return levels[loglevel];
      }
      return levels['warn'];
     }
     return loglevel;
  }

  report(lvl, arg, arg2) {
    let user = userText(arg);
    if (arg.res) {
      let ch = (arg2 === 'request completed') ? '<' : '-';
      this.log.info(`${ch} #${arg.res.request.id} ${arg.res.request.method} ${arg.res.request.url} (${arg2}) ${lvl.toUpperCase()}: ${arg.res.request.ip} ${user}[${micros(arg.responseTime)}µs]`);
      return;
    }
    if (arg.req) {
      let ch = (arg2 === 'incoming request') ? '>' : '-';
      this.log.info(`${ch} #${arg.req.id} ${arg.req.method} ${arg.req.url} (${arg2}) ${lvl.toUpperCase()}: ${arg.req.ip} ${user}`);
      return;
    }
  
    this.log.info([arg, arg2, user].join(': '));
  }
  
  trace(arg, arg2) { if (this.levelNum >= levels['trace']) this.report('TRACE', arg, arg2); }
  debug(arg, arg2) { if (this.levelNum >= levels['debug']) this.report('DEBUG', arg, arg2); }
  log(arg, arg2) { if (this.levelNum >= levels['info']) this.report('INFO', arg, arg2); }
  info(arg, arg2) { if (this.levelNum >= levels['info']) this.report('INFO', arg, arg2); }
  warn(arg, arg2) { if (this.levelNum >= levels['warn']) this.report('WARN', arg, arg2); }
  error(arg, arg2) { if (this.levelNum >= levels['error']) this.report('ERROR', arg, arg2); }
  fatal(arg, arg2) { if (this.levelNum >= levels['fatal']) this.report('FATAL', arg, arg2); }
}

module.exports = Logger;