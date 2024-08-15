const path = require('path');
//const fsPromises = require("fs/promises");  // requires Node 14.0.0 or later
const fsPromises = require("fs").promises;
const log = require('./log');

let debug_level = 0;

/* Summary of io interface required:
folderExists, folderCreate, folderGet, folderDelete,
fileExists, fileCreate, filePut, fileGet, fileDelete, pathDelete
jsonGet, symLink, symUnlink
*/

async function pathStat(folder, fn) {
  try {
    let pn = path.resolve(folder, fn);
    return await fsPromises.stat(pn);
  } catch (e) {
    return null;
  }
}
// fn is optional below
async function folderExists(folder, fn) {
  try {
    let pn = path.resolve(folder, fn || '');
    let stat=await fsPromises.stat(pn);
    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}
async function fileExists(folder, fn) {
  try {
    let pn = path.resolve(folder, fn || '');
    let stat=await fsPromises.stat(pn);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

/////////////////// Folder operations ///////////////////////
async function folderCreate(folder) {
  if (debug_level) log.info(`mkdir: ${folder}`);
  if (!folder) {  // check if user trying to go outside their own subfolder
    log.error('Error (mkdir): Invalid folder create.')
    return false;
  }

  let pn = path.resolve(folder);
  let result = await fsPromises.mkdir(pn, { recursive: true, mode: 0o770});
  if (result) {
    log.info(`Created folder: ${result}`);
  }
  return result;
}

async function folderDelete(folder) {
  if (debug_level) log.info(`rmdir: ${folder}`);
  if (!folder) {  // check if user trying to go outside their own subfolder
    log.error('Error (rmdir): Invalid folder delete.')
    return false;
  }

  let pn = path.resolve(folder);
  return await fsPromises.rmdir(pn, { recursive: true });
}

async function folderGet(folder) {
  if (debug_level) log.info(`readdir: ${folder}`);
  if (!folder) {  // check if user trying to go outside their own subfolder
    log.error('Error (readdir): Invalid folder read.')
    return false;
  }

  let pn = path.resolve(folder);
  let result = await fsPromises.readdir(pn);
  return result;
}

async function fileGet(folder, fn, encoding) {
  if (debug_level) log.info(`readFile: ${folder} ${fn}`);
  if (!fn) {
    log.error('Error (writeFile): Invalid read.')
    return false;
  }
  let pn = folder ? path.resolve(folder, fn) : path.resolve(fn);

  // If third parameter is not supplied, assume UTF-8, otherise use it directly (pass null for binary).
  let enc = (encoding === undefined) ? 'utf8' : encoding;

  // const result =  fs.readFileSync(pn,'utf8');
  const result = await fsPromises.readFile(pn, {encoding: enc});
  return result;
}

// file
async function filePut(folder, fn, payload) {
  if (debug_level) log.info(`writeFile: ${folder} ${fn}`);
  if (!fn) {
    log.error('Error (writeFile): Invalid write.')
    return false;
  }

  let pn = path.resolve(folder, fn);
  let parsed = path.parse(pn);
  let uid = parsed.name;
  let ext = parsed.ext;
  let type = (ext === '') ? '' : ext.slice(1);

  let json = payload;
  await fsPromises.writeFile(pn, json, { mode: 0o660 });

  if (type !== 'json') {
    // it was something else so create a .json metadata file too.
    let jfn = uid+'.json';
    let jpn = path.join(parsed.dir, jfn);
    json = { uid, type, name: jfn };
    await fsPromises.writeFile(jpn, json, { mode: 0o660 });
  }

  return json;
}

async function fileDelete(folder, fn) {
  if (debug_level) log.info(`unlink: ${folder} ${fn}`);
  if (!(folder && fn)) {  // check if user trying to go outside their own subfolder
    log.error('Error (unlink): Invalid delete.')
    return false;
  }

  let pn = path.resolve(folder, fn);
  return await fsPromises.unlink(pn);
}

// This is a low-level internal call used for error handling in assets.
async function pathDelete(pn) {
  if (debug_level) log.info(`unlink: ${pn}`);
  if (!pn) {
    log.error('Error (unlink): Invalid delete.')
    return false;
  }
  return await fsPromises.unlink(pn);
}

//////////////////////////////

// This function returns the position of the first '#' AFTER any '"' characters,
// but handles the case where the '#' comes first.
function findComment(line) {
  let x = line.indexOf('#');
  let q = line.indexOf('"');
  if (x < 0 || q < 0) return x;
  if (x < q) return x;

  while (x >= 0) {
    q = line.indexOf('"', x);
    if (q < 0) break;
    x = line.indexOf('#', q);
  }
  return x;
}

// This is just a JSON read and parse except it supports '#' as a line-based comment.
async function jsonGet(pn, fn) {
  let jsonLines = [];
  try {
    if (pn === '') pn = '.';
    let text = await fileGet(pn, fn);
    let lines = text.replace(/\r\n/g,'\n').split('\n');
    for (let line of lines) {
      let x = findComment(line);
      line = (x < 0) ? line : line.substring(0, x);
      line = line.trim();
      if (line.length > 0)
        jsonLines.push(line);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    log.error(`${fn}: ${err.message} for ${pn}`);
    process.exit(1);
  }

  try {
    let json = jsonLines.join('');
    let cfg = JSON.parse(json);
    return cfg;
  } catch (err) {
    log.error(`${fn}: ${err.message} for ${pn}`);
    process.exit(2);
  }
  return null;
}

// this method uses a file system link to associate an existing src folder/file with a new dest folder/file.
async function symLink(src, dest) {
  if (debug_level) log.info(`symLink: ${src} ${dest}`);
  if (!(src && dest)) {  // check if user trying to go outside their own subfolder
    log.error('Error (symLink): Invalid request.')
    return false;
  }

  let existingPath = path.resolve(src)
  let newPath = path.resolve(dest);
  log.info(`*** symlink: "${existingPath}" as "${newPath}`)
  return await fsPromises.symlink(existingPath, newPath, 'junction');
}
// Needed for user delete and user login ID changes. Not to be confused with a user delete.
async function symUnlink(name) {
  if (debug_level) log.info(`symUnlink: ${name}`);
  if (!name) {
    log.error('Error (symUnlink): Invalid request.')
    return false;
  }

  let pn = path.resolve(name);
  return await fsPromises.unlink(pn);
}

module.exports = {
  fileExists, filePut, fileGet, fileDelete,
  folderExists, folderCreate, folderGet, folderDelete,
  pathDelete, pathStat, symLink, symUnlink, jsonGet
 };
