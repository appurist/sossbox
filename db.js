const path = require('path');
const fsPromises = require("fs/promises");
const config = require('./config');

const USERMETA = 'meta.json';
let base = './data'

let debug_level = 0;

async function init(newBase) {
  // check for parameter override, otherwise environment override
  if (!newBase) {
    newBase = config.DATA;
  }
  // got something?
  if (newBase) {
    base = newBase;
  }

  base = path.resolve(base);
  await folderCreate(base); // create if necessary
  await folderCreate(path.join(base, 'users')); // create if necessary
  await folderCreate(path.join(base, 'logins')); // create if necessary
  console.log("Storage will be at:", base);
  return base;
}

/////////////////// File system operations ///////////////////////
async function folderCreate(folder) {
  if (debug_level) console.log("mkdir:", folder);
  if (!folder) {  // check if user trying to go outside their own subfolder
    console.error('Error (mkdir): Invalid folder create.')
    return false;
  }

  let pn = path.isAbsolute(folder) ? folder : path.join(base, folder);
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

  let pn = path.isAbsolute(folder) ? folder : path.join(base, folder);
  return await fsPromises.rmdir(pn, { recursive: true });
}

async function folderGet(folder) {
  if (debug_level) console.log("readdir:", folder);
  if (!folder) {  // check if user trying to go outside their own subfolder
    console.error('Error (readdir): Invalid folder read.')
    return false;
  }

  let pn = path.isAbsolute(folder) ? folder : path.join(base, folder);
  let result = await fsPromises.readdir(pn);
  return result;
}

async function fileGet(folder, name) {
  if (debug_level) console.log("readFile:", folder, name);
  if (!(folder && name)) {  // check if user trying to go outside their own subfolder
    console.error('Error (readFile): Invalid read.')
    return false;
  }

  let fn = path.isAbsolute(folder) ? path.join(folder, name) : path.join(base, folder, name);
  const result = await fsPromises.readFile(fn,'utf8');
  return result;
}

// file
async function filePut(folder, fn, payload) {
  if (debug_level) console.log("writeFile:", folder, fn);
  if (!(folder && fn)) {  // check if user trying to go outside their own subfolder
    console.error('Error (writeFile): Invalid write.')
    return false;
  }

  let pn = path.isAbsolute(folder) ? path.join(folder, fn) : path.join(base, folder, fn);
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

async function fileDelete(folder, name) {
  if (debug_level) console.log("unlink:", folder, name);
  if (!(folder && name)) {  // check if user trying to go outside their own subfolder
    console.error('Error (unlink): Invalid delete.')
    return false;
  }

  let fn = path.isAbsolute(folder) ? path.join(folder, name) : path.join(base, folder, name);
  return await fsPromises.unlink(fn);
}


// this method uses a file system link to associate a login ID with a user UID (folder)
async function userLink(name, who) {
  if (debug_level) console.log("userLink:", name, who);
  if (!(name && who)) {  // check if user trying to go outside their own subfolder
    console.error('Error (userLink): Invalid request.')
    return false;
  }

  let existingPath = path.join(base, 'users', who);
  let newPath = path.join(base, 'logins', name);
  return await fsPromises.symlink(existingPath, newPath, 'junction');
}
// Needed for user delete and user login ID changes. Not to be confused with a user delete.
async function userUnlink(name) {
  if (debug_level) console.log("userUnlink:", name);
  if (!name) {  // check if user trying to go outside their own subfolder
    console.error('Error (userUnlink): Invalid request.')
    return false;
  }

  let pn = path.join(base, 'logins', name);
  return await fsPromises.unlink(pn);
}

/////////////////// Generic operations that take a user as the first param, or null for system-level operations /////////////////
// For the rest of this file, who refers to the UID of a user, where refers to a (sub)collection name, which refers to a specific document.

function userFolder(who, where) {
  if (!where) {
    where = '';
  }
  return who ? path.join('users', who, where) : null;
}

async function userCollections(who) {
  return await folderGet(userFolder(who, ''));
}

async function userListDocs(who, where) {
  let docs = await folderGet(userFolder(who, where));
  // let results = docs.map(doc => doc.endsWith('.json') ? doc.substring(0, doc.length-5) : doc)
  return docs;
}

// who, where and which are all UIDs, for user, collection, document
async function userDocGet(who, where, which) {
  let json = await fileGet(userFolder(who, where), which);
  return JSON.parse(json);
}

async function userDocCreate(who, where, which, payload) {
  let text = (typeof payload === 'string') ? payload : JSON.stringify(payload);
  return await filePut(userFolder(who, where), which, text);
}

async function userDocReplace(who, where, which, payload) {
  // replace doc with payload
  let text = (typeof payload === 'string') ? payload : JSON.stringify(payload);
  return await filePut(userFolder(who, where), which, text);
}

async function userDocUpdate(who, where, which, updates) {
  let rec = await fileGet(who, where, which);
  // update (merge) doc with payload
  let payload = Object.assign({ }, rec, updates);
  let text = (typeof payload === 'string') ? payload : JSON.stringify(payload);
  return await filePut(userFolder(who, where), which, text);
}

async function userDocDelete(who, where, which) {
  return await fileDelete(userFolder(who, where), which);
}

// These two know about the important user subfolders.
let userDataFolders = [ 'assets', 'projects']
async function userCreateTree(who) {
  let result = true;
  for (let folder of userDataFolders) {
    let fresult = await folderCreate(userFolder(who, folder));
    result = result && fresult; // continue on error but track overall success/fail
  }
  return result;
}
async function userDeleteTree(who) {
  let result = true;
  for (let folder of userDataFolders) {
    let fresult = await folderDelete(userFolder(who, folder));
    result = result && fresult; // continue on error but track overall success/fail
  }
  return result;
}

// like createDoc, but creates a document with credentials that can be checked by userLogin()
async function userCreate(credentials, user) {
  let payload = { credentials, user };
  await userCreateTree(user.uid);
  await filePut(userFolder(user.uid, ''), USERMETA, JSON.stringify(payload, 2));
  await userLink(user.login, user.uid);
  return payload; // the only really important one?
}

// like createDoc, but creates a document with credentials that can be checked by serverClient.login()
async function userDelete(user) {
  let result1 = await userUnlink(user.login);
  let result2 = await userDeleteTree(user.uid);

  // TODO: Force-logout all?

  // now, in the top-level server database, create a user record
  let result3 = await folderDelete(userFolder(who));

  return result1 && result2 && result3;
}

function userGetClient(uid, payload) {
  let client = null;

  if (userClients[uid]) {
    client = userClients[uid];
  }
  if (client) {
    return client;
  }

  // store this client for reuse. Unchanged? More fields e.g. session info?
  userClients[uid] = payload;
  return client;
}

async function userByUID(who) {
  let userjson = await fileGet(userFolder(who), USERMETA);
  return userjson ? JSON.parse(userjson) : null;
}
async function userByLogin(name) {
  let pn = path.join('logins', name);
  let userjson = await fileGet(pn, USERMETA);
  return userjson ? JSON.parse(userjson) : null;
}

module.exports = {
  init,
  folderCreate, folderGet, folderDelete,
  filePut, fileGet, fileDelete,

  userDocCreate, userListDocs, userDocDelete,
  userDocGet, userDocReplace, userDocUpdate,

  userByUID, userByLogin, userCollections,
  userCreate, userDelete
 };
