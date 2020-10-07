const io = require('./io');
const Site = require('./site');

const SERVER_CFG = 'sossbox.cfg';
const SITE_CFG = 'site.cfg';

let cfg = { };
let siteMap = new Map;  // note this is a Map, use set() and get()

// config has name and sites (folder)
const DEFAULT_CFG = {
  name: 'SOSSBox Server',
  sites: './sites'
}

// each site has id, name and sites (folder)
const DEFAULT_SITE = {
  secret: null, // required from file
  domain: null, // required from file but more for reporting and documentation
  id: null,     // not required, defaults to the folder name, e.g. 'sossbox'

  // Site installation CAN update these to something more appropriate for that site.
  name: 'SOSSBox',
  port: 23232,
  register: true,
  public: "public",

  // Site installation CAN update these to something else if the effects are understood.
  data: '.',
  host: '0.0.0.0'
}

async function init() {
  cfg = Object.assign({}, DEFAULT_CFG, await io.jsonGet('', SERVER_CFG));
  let currentFolder = process.cwd();  // was __dirname but when packaged that is "/snapshot/"
  let sitesFolder = Site.resolveSiteBase(currentFolder, cfg.sites);
  console.log("Root storage will be at:", sitesFolder);


  let siteFolders = await io.folderGet(sitesFolder);
  for (let folder of siteFolders) {
    let site = new Site(sitesFolder, folder);
    let sitePath = site.getSitePath();
    let rawCfg = await io.jsonGet(sitePath, SITE_CFG);
    siteCfg = Object.assign({}, DEFAULT_SITE, rawCfg);

    // initSiteData returns the resolved path to the per-site data folder.
    let siteData = await site.initSiteData(siteCfg);  // create if needed and return path

    if (siteCfg) {  // cache it in the siteMap
      siteMap.set(siteCfg.id, site);
      console.log(`Storage ready for '${siteCfg.name}' ('${siteCfg.id}'): ${siteData}`);
    }
  }

  return cfg;
}

function getConfig() {
  return cfg;
}

function getSite(siteName) {
  let site = siteMap.get(siteName);
  return site ? site : null;
}

function forEachSiteID(callback) {
  for (let site of siteMap.values()) {
    callback(site.getId());
  }
}
function forEachSite(callback) {
  for (let site of siteMap.values()) {
    callback(site);
  }
}
async function forEachSiteAsync(callback) {
  for (let site of siteMap.values()) {
    await callback(site);
  }
}

// due to circular module references, be sure to declare exports before requiring the circular module (storage);
module.exports = { init, getConfig, forEachSiteID, forEachSite, forEachSiteAsync, getSite };
