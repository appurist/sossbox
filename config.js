const storage = require('./storage');

const SERVER_CFG = 'sossbox.cfg';
const SITE_CFG = 'site.cfg';

// config has name and sites (folder)
const DEFAULT_CFG = {
  name: 'SOSSBox Server',
  sites: './sites'
}
let cfg = { };

// each site has id, name and sites (folder)
const DEFAULT_SITE = {
  secret: null, // required from file
  domain: null, // required from file but more for reporting and documentation
  id: null,     // not required, defaults to the folder name, e.g. 'sossbox'

  // Site installation CAN update these to something more appropriate for that site.
  name: 'SOSSBox',
  port: 23232,
  register: true,
  static: "static",

  // Site installation CAN update these to something else if the effects are understood.
  folder: '.',
  host: '0.0.0.0'
}
let siteMap = new Map;  // note this is a Map, use set() and get()

function getConfig() {
  return cfg;
}

function getSite(siteName) {
  let site = siteMap.get(siteName);
  return site ? site : null;
}

async function init() {
  cfg = Object.assign({}, DEFAULT_CFG, await storage.readCfg('', SERVER_CFG));
  let base = await storage.resolveSite(cfg.sites);
  console.log("Storage will be at:", base);

  let siteNames = await storage.folderGet(cfg.sites);
  for (let site of siteNames) {
    let siteBase = await storage.ensureSite(cfg.sites, site);  // create if needed and return path
    let siteCfg = Object.assign({}, DEFAULT_SITE, await storage.readCfg(siteBase, SITE_CFG));
    if (siteCfg) {
      siteCfg.id = siteCfg.id || site;
      siteCfg.folder = siteBase;
      siteMap.set(site, siteCfg);
      console.log(`Storage ready for '${siteCfg.name}': ${siteCfg.folder}`);
    }
  }

  return cfg;
}

function forEachSiteID(callback) {
  console.log("sites:", siteMap)
  for (let site of siteMap.values()) {
    callback(site.id);
  }
}
function forEachSite(callback) {
  console.log("sites:", siteMap)
  for (let site of siteMap.values()) {
    callback(site);
  }
}
async function forEachSiteAsync(callback) {
  console.log("sites:", siteMap)
  for (let site of siteMap.values()) {
    await callback(site);
  }
}

// due to circular module references, be sure to declare exports before requiring the circular module (storage);
module.exports = { init, getConfig, forEachSiteID, forEachSite, forEachSiteAsync, getSite };
