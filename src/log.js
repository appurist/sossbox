const path = require('path');
const fs = require('fs');

const OFF = 0;
const DEBUG = 1;
const INFO = 3;
const WARN = 5;
const ERROR = 7;
const FATAL = 8;
const FORCE = 9;  // always comes out but displayed like INFO.

function rootname(fn) {
  return path.basename(path.basename(fn, '.exe'), '.EXE');
}

function executableFolder() {
  let arg = 0;
  let root = rootname(process.argv[0]);
  if (root.toLowerCase() === 'node') {
    arg = 1;
  }

  return path.dirname(process.argv[arg]);
}

let execFolder = executableFolder();
let logPath = path.join(execFolder,'sossdata.log');
let logLevel = WARN;

init(logLevel, 'sossdata.log')

// loglevel must be a normal loglevel string from the levels array above.
function init(level, fn) {
  setLevel(level);
  logPath = path.isAbsolute(fn) ? path.resolve(fn) : path.resolve(execFolder, fn);
}

function setLevel(level) {
  if (typeof level === 'string') {
    switch (level) {
      case 'debug': logLevel = DEBUG; break;
      case 'info': logLevel = INFO; break;
      case 'warn': logLevel = WARN; break;
      case 'error': logLevel = ERROR; break;
      case 'fatal': logLevel = FATAL; break;
      case 'force': logLevel = FORCE; break;
      default: logLevel = WARN;
    }
  } else {
    logLevel = level;
  }
}

function twoDigits(n) {
  return (n >=0) && (n <= 9) ? '0'+n : ''+n;
}

function getTimestamp(when) {
  let dateStamp = `${when.getFullYear()}-${twoDigits(when.getMonth()+1)}-${twoDigits(when.getDate())}`;
  let timeStamp = `${twoDigits(when.getHours())}:${twoDigits(when.getMinutes())}:${twoDigits(when.getSeconds())}`;
  return dateStamp + ' ' + timeStamp;
}

function levelPrefix(level) {
  if (level >= FORCE) return 'INFO';
  if (level >= FATAL) return 'FATAL';
  if (level >= ERROR) return 'ERROR';
  if (level >= WARN) return 'WARN';
  if (level >= INFO) return 'INFO';
  if (level >= DEBUG) return 'DEBUG';
}

let errors = 0;
function log(level, msg) {
  if (level < logLevel) {
    return; // below the reporting threshold, nothing to do.
  }

  let stamp = getTimestamp(new Date());
  msg = stamp + ' [' + levelPrefix(level) + '] ' + msg;
  if (level >= FORCE)
    console.log(msg);
  else
  if (level >= ERROR)
    console.error(msg);
  else
  if (level >= WARN)
    console.warn(msg);
  else
    console.log(msg);

  fs.appendFile(logPath, msg+'\n', (err) => {
    if (err) {
      if (errors++ === 0) {
        console.error(err.message);
      }
    }
  });
}

function debug(msg) { log(DEBUG, msg); }
function info(msg) { log(INFO, msg); }
function warn(msg) { log(WARN, msg); }
function error(msg) { log(ERROR, msg); }
function fatal(msg) { log(FATAL, msg); }
function force(msg) { log(FORCE, msg); }

module.exports = { OFF, DEBUG, INFO, WARN, ERROR, FATAL, init, log, debug, info, warn, error, fatal, force};
