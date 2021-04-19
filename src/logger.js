const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

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

function executableFolder() {
  let arg = 0;
  let root = rootname(process.argv[0]);
  if (root.toLowerCase() === 'node') {
    arg = 1;
  }

  return path.dirname(process.argv[arg]);
}

let execFolder = executableFolder();
let logPath = path.join(execFolder,'sossbox.log');
let logFile = null;
let logLevel = WARN;

init(logLevel, 'sossbox.log');

// loglevel must be a normal loglevel string from the levels array above.
async function init(level, fn) {
  try {
    setLevel(level);

    let newLogPath = path.isAbsolute(fn) ? path.resolve(fn) : path.resolve(execFolder, fn);
    if (logFile && (newLogPath !== logPath)) {
      await logFile.close();
      logFile = null;
    }
    if (!logFile) {
      await fsp.open(newLogPath, 'w');
    }
  } catch (err) {
    console.error(err.message);
  }
}

function setLevel(level) {
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
}

function log(level, msg) {
  try {
    if (level < logLevel) {
      return; // below the reporting threshold, nothing to do.
    }

    console.log(msg);
    logFile.appendFile(msg)
    .then()
    .catch((err)=>{
      console.error(err.message);
    });
  }
  catch(err) {
    console.error(err.message);
  }
}

function debug(msg) { log(DEBUG, msg); }
function info(msg) { log(INFO, msg); }
function warn(msg) { log(WARN, msg); }
function error(msg) { log(ERROR, msg); }
function fatal(msg) { log(FATAL, msg); }

module.exports = { OFF, DEBUG, INFO, WARN, ERROR, FATAL, init, log, debug, info, warn, error, fatal};