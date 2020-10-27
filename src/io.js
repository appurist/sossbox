const path = require('path');
const fsPromises = require("fs/promises");

let debug_level = 0;

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
  if (debug_level) console.log("mkdir:", folder);
  if (!folder) {  // check if user trying to go outside their own subfolder
    console.error('Error (mkdir): Invalid folder create.')
    return false;
  }

  let pn = path.resolve(folder);
  let result = await fsPromises.mkdir(pn, { recursive: true, mode: 0o770});
  if (result) {
    console.log("Created folder:", result);
  }
  return result;
}

async function folderDelete(folder) {
  if (debug_level) console.log("rmdir:", folder);
  if (!folder) {  // check if user trying to go outside their own subfolder
    console.error('Error (rmdir): Invalid folder delete.')
    return false;
  }

  let pn = path.resolve(folder);
  return await fsPromises.rmdir(pn, { recursive: true });
}

async function folderGet(folder) {
  if (debug_level) console.log("readdir:", folder);
  if (!folder) {  // check if user trying to go outside their own subfolder
    console.error('Error (readdir): Invalid folder read.')
    return false;
  }

  let pn = path.resolve(folder);
  let result = await fsPromises.readdir(pn);
  return result;
}

async function fileGet(folder, fn) {
  if (debug_level) console.log("readFile:", folder, fn);
  if (!fn) {
    console.error('Error (writeFile): Invalid read.')
    return false;
  }
  let pn = folder ? path.resolve(folder, fn) : path.resolve(fn);
  const result = await fsPromises.readFile(pn,'utf8');
  return result;
}

// file
async function filePut(folder, fn, payload) {
  if (debug_level) console.log("writeFile:", folder, fn);
  if (!fn) {
    console.error('Error (writeFile): Invalid write.')
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
  if (debug_level) console.log("unlink:", folder, fn);
  if (!(folder && fn)) {  // check if user trying to go outside their own subfolder
    console.error('Error (unlink): Invalid delete.')
    return false;
  }

  let pn = path.resolve(folder, fn);
  return await fsPromises.unlink(pn);
}

//////////////////////////////

// This function returns the position of the first '#' AFTER any '#' characters,
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
    console.error(`${fn}: ${err.message} for ${pn}`);
    process.exit(1);
  }

  try {
    let json = jsonLines.join('');
    cfg = JSON.parse(json);
    return cfg;
  } catch (err) {
    console.error(`${fn}: ${err.message} for ${pn}`);
    process.exit(2);
  }
  return null;
}

// this method uses a file system link to associate an existing src folder/file with a new dest folder/file.
async function symLink(src, dest) {
  if (debug_level) console.log("symLink:", src, dest);
  if (!(src && dest)) {  // check if user trying to go outside their own subfolder
    console.error('Error (symLink): Invalid request.')
    return false;
  }

  let existingPath = path.resolve(src)
  let newPath = path.resolve(dest);
  console.log(`*** symlink: "${existingPath}" as "${newPath}`)
  return await fsPromises.symlink(existingPath, newPath, 'junction');
}
// Needed for user delete and user login ID changes. Not to be confused with a user delete.
async function symUnlink(name) {
  if (debug_level) console.log("symUnlink:", name);
  if (!name) {
    console.error('Error (symUnlink): Invalid request.')
    return false;
  }

  let pn = path.resolve(name);
  return await fsPromises.unlink(pn);
}

module.exports = {
  fileExists, filePut, fileGet, fileDelete,

  folderExists, folderCreate, folderGet, folderDelete,

  pathStat, symLink, symUnlink, jsonGet
 };
