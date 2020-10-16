const { SITES_FOLDER } = require('./constants');
const path = require('path');

const io = require('./io');
const Site = require('./site');

const {SERVER_CFG, SITE_CFG} = require('./constants')

let cfg = { };
let siteMap = new Map;  // note this is a Map, use set() and get()

async function init() {
  // init the main site
  let rootFolder = process.cwd();  // was __dirname but when packaged that is "/snapshot/"

  // start with the main site
  let mainSite = new Site(rootFolder);
  await mainSite.initSite(SERVER_CFG);
  siteMap.set(mainSite.id, mainSite);

  // now find the sub-sites
  mainSite.sites = mainSite.sites || SITES_FOLDER;
  let sitesFolder = path.resolve(rootFolder, mainSite.sites);
  if (mainSite.sites && await io.folderExists(sitesFolder)) {
    let sites = await io.folderGet(sitesFolder);
    if (sites) {
      console.log(`Found ${sites.length} additional sites at ${sitesFolder}`);
      mainSite.sitesFolder = sitesFolder;
      for (let folder of sites) {
        let siteBase = path.join(sitesFolder, folder);
        let site = new Site(siteBase);
        await site.initSite(SITE_CFG);
        siteMap.set(site.id, site);
      }
    }
  }

  return mainSite;
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
