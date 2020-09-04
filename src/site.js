const path = require('path');
const io = require('./io');

const USERMETA = 'meta.json';

let debug_level = 0;

class Site {
  constructor(sites, folder) {
    this.siteBase = Site.resolveSiteBase(sites, folder);
    this.siteData = this.siteBase; // default to the same folder
    this.siteCfg = { };
  }

  getSiteId()  { return this.id; }
  getSiteCfg() { return this.siteCfg; }
  getSiteBase() { return this.siteBase; }
  getSiteData() { return this.siteData; }

  static resolveSiteBase(absPath, relPath) {
    let sitesPath = relPath || './sites';
    return path.isAbsolute(sitesPath) ? path.resolve(sitesPath) : path.resolve(absPath, sitesPath);
  }

  // pass in the per-site config including the relative/absolute data folder.
  async initSiteData(siteCfg) {
    this.siteCfg = Object.assign({}, siteCfg);
    this.data = this.siteCfg.data; // possibly complete different location than sitebase, or the same.

    // shorter convenience aliases
    this.id = this.siteCfg.id;
    this.name = this.siteCfg.name;
    this.domain = this.siteCfg.domain;
    this.port = this.siteCfg.port;
    this.register = this.siteCfg.register;
    this.public = this.siteCfg.public;
    this.host = this.siteCfg.host;
    this.prefix = this.siteCfg.prefix;
    // This feature uses 'port', 'domain' and 'prefix' fields. If a prefix is specified, it is prepended to the route URL before the route
    // (e.g. api.blah.com subdomain in 'domain', plus a '/sitename' prefix and '/status' becomes `https://api.blah.com/sitename/status') 
    // and the main listener is used (this port is ignored).

    // now determine where the per-site data actually is
    let result = this.siteBase; // default to the same folder for data and site folder
    if (this.data) {
      if (path.isAbsolute(this.data)) {
        result = path.resolve(this.data);
      } else {
        result = path.resolve(this.siteBase, this.data);
      }
    } else {
      result = path.resolve(this.siteBase);
    }
    this.siteData = result;

    // Now make sure the initial folder structure is in place.
    // Create initial site subfolders if necessary
    await io.folderCreate(this.siteData);
    await io.folderCreate(path.join(this.siteData, 'users'));
    await io.folderCreate(path.join(this.siteData, 'logins'));

    // Return the siteData location from per-site config.
    return result;
  }

  async fileGet(folder, fn) {
    let pn = path.join(this.siteData, folder);
    return await io.fileGet(pn, fn);
  }
  async docGet(folder, fn) {
    let pn = path.join(this.siteData, folder);
    return await io.jsonGet(pn, fn);
  }
  async folderGet(folder) {
    let pn = path.join(this.siteData, folder);
    return await io.folderGet(pn);
  }

  // this method uses a file system link to associate a login ID with a user UID (folder)
  async userLink(name, who) {
    if (debug_level) console.log("userLink:", name, who);
    if (!(name && who)) {
      console.error('Error (userLink): Invalid request,', name, who)
      return false;
    }

    let existingPath = path.join(this.siteData, 'users', who);
    let newPath = path.join(this.siteData, 'logins', name);

    return await io.symLink(existingPath, newPath, 'junction');
  }
  // Needed for user delete and user login ID changes. Not to be confused with a user delete.
  async userUnlink(name) {
    if (debug_level) console.log("userUnlink:", name);
    if (!name) {  // check if user trying to go outside their own subfolder
      console.error('Error (userUnlink): Invalid request.')
      return false;
    }

    let pn = path.join(this.siteData, 'logins', name);
    return await io.symUnlink(pn);
  }

  /////////////////// Generic operations that take a user as the first param, or null for system-level operations /////////////////
  // For the rest of this file, who refers to the UID of a user, where refers to a (sub)collection name, which refers to a specific document.

  userFolder(who, where) {
    let pn = path.join(this.siteData, 'users', who);
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
    await this.userCreateTree(user.uid);
    await io.filePut(this.userFolder(user.uid, ''), USERMETA, JSON.stringify(payload, 2));
    await this.userLink(user.login, user.uid);
    return payload; // the only really important one?
  }

  // like createDoc, but creates a document with credentials that can be checked by serverClient.login()
  async userDelete(uid) {
    let user = await this.userByUID(uid);
    if (user) {
      let result1 = await this.userUnlink(user.login);
      let result2 = await this.userDeleteSubfolders(user.uid);

      // TODO: Force-logout all?

      // now, in the top-level server database, create a user record
      let result3 = await io.folderDelete(this.userFolder(who));
    }

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
    let pn = path.join(this.siteData, 'logins', name);
    return await io.jsonGet(pn, USERMETA) || null;
  }
}

module.exports = Site;