const { envGet } = require('./env');

const path = require('path');
const io = require('./io');
const log = require('./log');

const {SERVER_CFG, USERMETA, PUBLIC_FOLDER, DATA_FOLDER} = require('./constants')

let debug_level = 0;
let userClients = [ ];

class Store {
  constructor(base) {
    this.base = base;

    this.host = envGet('HOST', '0.0.0.0');
    this.port = envGet('PORT', 0);
    this.api = envGet('API', '/');
    this.public = envGet('PUBLIC', PUBLIC_FOLDER);
    this.data = envGet('DATA', DATA_FOLDER);
    this.storage = envGet('STORAGE', true);
    this.registration = envGet('REGISTRATION', true);
    this.secret = envGet('SECRET', 'secret');
    this.admin = envGet('ADMIN', 'admin');
    this.loglevel = envGet('LOGLEVEL', 'warn');
    this.logfile = envGet('LOGFILE', 'sossbox.log');
    // the default identity
    this.id = envGet('ID', 'sossbox');
    this.name = envGet('NAME', 'SOSSBox');
  }

  // Separate init function from constructor to separate async calls.
  async init() {
    let configOverrides = await io.jsonGet(this.base, SERVER_CFG) || {};

    // add overrides to defaults from config
    for (let k in configOverrides) {
      let key = k.toLowerCase();
      this[key] = configOverrides[key];
    }

    // now determine where the config data actually is
    this.data = this.storage ? path.resolve(this.base, this.data) : null;
    this.public = path.resolve(this.base, this.public);

    // check if static/public folder exists
    if (await io.folderExists(this.public)) {
      // log.info(`Found public folder for '${this.name}' ('${this.id}') port ${this.port} at ${this.api}: ${this.public}`);
    } else {
      this.public = null;  // clear it so we know not to try to use data that doesn't exist
    }

    // check if storage location exists
    if (this.data) {
      if (!await io.folderExists(this.data)) {
        log.info(`Creating storage for '${this.name}' ('${this.id}') at ${this.data}`);
        await io.folderCreate(this.data);
      }
      if (await io.folderExists(this.data)) {
        // Now make sure the initial folder structure is in place, create initial subfolders if necessary.
        await io.folderCreate(path.join(this.data, 'users'));
        await io.folderCreate(path.join(this.data, 'logins'));
        log.force(`Storage ready for '${this.name}' ('${this.id}'): ${this.data}`);
      } else {
        this.data = null; // clear it so we know not to try to use data that doesn't exist
      }
    }
  }

  async fileGet(folder, fn) {
    let pn = path.resolve(this.data, folder);
    return await io.fileGet(pn, fn);
  }
  async docGet(folder, fn) {
    let pn = path.resolve(this.data, folder);
    return await io.jsonGet(pn, fn);
  }
  async folderGet(folder) {
    let pn = path.resolve(this.data, folder);
    return await io.folderGet(pn);
  }

  // this method checks if a folder for a give login ID already exists
  async loginExists(name) {
    if (debug_level) log.info(`loginExists: ${name}`);
    if (!name) {
      log.error(`Error (loginExists): Invalid request, ${name}`)
      return false;
    }

    let newPath = path.join(this.data, 'logins', name);
    let folder = await io.folderExists(newPath);
    let file = await io.fileExists(this.data, 'logins');
    return folder || file;
  }
  
  // this method uses a file system link to associate a login ID with a user UID (folder)
  async userLink(name, who) {
    if (debug_level) log.info(`userLink: ${name} ${who}`);
    if (!(name && who)) {
      log.error(`Error (userLink): Invalid request, ${name} ${who}`);
      return false;
    }

    let existingPath = path.join(this.data, 'users', who);
    let newPath = path.join(this.data, 'logins', name);

    return await io.symLink(existingPath, newPath, 'junction');
  }
  // Needed for user delete and user login ID changes. Not to be confused with a user delete.
  async userUnlink(name) {
    if (debug_level) log.info(`userUnlink: ${name}`);
    if (!name) {  // check if user trying to go outside their own subfolder
      log.error('Error (userUnlink): Invalid request.')
      return false;
    }

    let pn = path.join(this.data, 'logins', name);
    return await io.symUnlink(pn);
  }

  /////////////////// Generic operations that take a user as the first param, or null for system-level operations /////////////////
  // For the rest of this file, who refers to the UID of a user, where refers to a (sub)collection name, which refers to a specific document.

  userFolder(who, where) {
    let pn = path.join(this.data, 'users', who);
    return where ? path.join(pn, where) : pn;
  }

  async userCollections(who) {
    return await io.folderGet(this.userFolder(who, ''));
  }

  async userListDocs(who, where) {
    return await io.folderGet(this.userFolder(who, where));
  }

  // who, where and which are all UIDs, for user, collection, document
  async userDocGet(who, where, which) {
    return await io.jsonGet(this.userFolder(who, where), which);
  }

  async userDocCreate(who, where, which, payload) {
    let text = (typeof payload === 'string') ? payload : JSON.stringify(payload);
    return await io.filePut(this.userFolder(who, where), which, text);
  }

  async userDocReplace(who, where, which, payload) {
    // replace doc with payload
    let text = (typeof payload === 'string') ? payload : JSON.stringify(payload);
    return await io.filePut(this.userFolder(who, where), which, text);
  }

  async userDocUpdate(who, where, which, updates) {
    let folder = this.userFolder(who, where);
    let rec = await io.fileGet(folder, which);
    // update (merge) doc with payload
    let payload = Object.assign({ }, rec, updates);
    let text = (typeof payload === 'string') ? payload : JSON.stringify(payload);
    return await io.filePut(folder, which, text);
  }

  async userDocDelete(who, where, which) {
    return await io.fileDelete(this.userFolder(who, where), which);
  }

  // These two know about the important user subfolders.
  async userCreateTree(who) {
    let userDataFolders = [ 'assets', 'projects'];
    let result = true;
    for (let folder of userDataFolders) {
      let fresult = await io.folderCreate(this.userFolder(who, folder));
      result = result && fresult; // continue on error but track overall success/fail
    }
    return result;
  }
  async userDeleteSubfolders(who) {
    let userDataFolders = [ 'assets', 'projects'];
    let result = true;
    for (let folder of userDataFolders) {
      let fresult = await io.folderDelete(this.userFolder(who, folder));
      result = result && fresult; // continue on error but track overall success/fail
    }
    return result;
  }

  // like createDoc, but creates a document with credentials that can be checked by userLogin()
  async userCreate(credentials, user) {
    let payload = { credentials, user };
    if (await this.loginExists(user.login)) {
      return false; // signals route handler to 409 it.
    }
    await this.userCreateTree(user.uid);
    await io.filePut(this.userFolder(user.uid, ''), USERMETA, JSON.stringify(payload, 2));
    await this.userLink(user.login, user.uid);
    return payload; // the only really important one?
  }

  // like createDoc, but creates a document with credentials that can be checked by serverClient.login()
  async userDelete(uid) {
    let user = await this.userByUID(uid);
    if (!user) return false;
    let result1 = await this.userUnlink(user.login);
    let result2 = await this.userDeleteSubfolders(user.uid);

    // TODO: Force-logout all

    // now, delete the user at the top-level
    let result3 = await io.folderDelete(this.userFolder(user.uid));
    return result1 && result2 && result3;
  }

  userGetClient(uid, payload) {
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

  async userByUID(who) {
    return await io.jsonGet(this.userFolder(who), USERMETA) || null;
  }
  async userByLogin(name) {
    let pn = path.join(this.data, 'logins', name);
    return await io.jsonGet(pn, USERMETA) || null;
  }
}

module.exports = Store;
