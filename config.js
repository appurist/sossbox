// Site installation MUST update these to something unique to that site.
let JWT_SECRET = 'sossbox_secret'

// Site installation SHOULD probably update these to something appropriate for that site.
let NAME = 'SOSSBox Server'
let DOMAIN = 'sossbox.com'
let PORT = 23232
let DATA = './data'

// Site installation CAN update these to something else if the effects are understood.
let HOST = '0.0.0.0'
let STATUS_NAME = 'sossbox'

///////////////////////////////////////////////////////////////////////////

// Sites should not modify any of this below.
if (process.env.PORT) {
  PORT = process.env.PORT.trim();
}
if (process.env.HOST) {
  HOST = process.env.HOST.trim();
}
if (process.env.JWT_SECRET) {
  JWT_SECRET = process.env.JWT_SECRET.trim();
}

module.exports = { JWT_SECRET, NAME, DOMAIN, DATA, PORT, HOST, STATUS_NAME };
