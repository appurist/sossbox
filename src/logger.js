const path = require('path');
const fsp = require('fs').promises;

const OFF = 0;
const DEBUG = 1;
const INFO = 3;
const WARN = 5;
const ERROR = 7;
const FATAL = 9;

function micros(ms) {
  return Math.round(ms*1000);
}

function rootname(fn) {
  return path.basename(path.basename(fn, '.exe'), '.EXE');
}

function execFolder() {
  let arg = 0;
  let root = rootname(process.argv[0]);
  if (root.toLowerCase() === 'node') {
    arg = 1;
  }

  return path.dirname(process.argv[arg]);
}

let folder = execFolder();

let logPath = path.join(folder,'sossbox.log');
let logFile = null;
let logLevel = WARN;

// loglevel must be a normal loglevel string from the levels array above.
function init(level, fn) {
  if (typeof level === 'string') {
    switch (level) {
      case 'debug': logLevel = DEBUG; break;
      case 'info': logLevel = INFO; break;
      case 'warn': logLevel = WARN; break;
      case 'error': logLevel = ERROR; break;
      case 'fatal': logLevel = FATAL; break;
      default: logLevel = WARN;
    }
  } else {
    logLevel = level;
  }

  if (fn) logPath = path.join(process.cwd(), fn);
}

function setLevel(level) {
  logLevel = level;
}

function open() {
  if(logFile)
    return Promise.resolve(logFile);
  return fsp.open(logPath, 'w');
}

function log(level, msg) {
  if (level < logLevel) {
    return; // below the reporting threshold, nothing to do.
  }

  open().then((f) => {
    if (!logFile) logFile = f;
    console.log(msg);
    fsp.writeFile(f, msg).then().catch((err)=>{
      console.error(err.message);
    });
  }).catch((err)=>{console.error(err.message)});
}

function debug(msg) { log(DEBUG, msg); }
function info(msg) { log(INFO, msg); }
function warn(msg) { log(WARN, msg); }
function error(msg) { log(ERROR, msg); }
function fatal(msg) { log(FATAL, msg); }

module.exports = { OFF, DEBUG, INFO, WARN, ERROR, FATAL, init, open, log, debug, info, warn, error, fatal};