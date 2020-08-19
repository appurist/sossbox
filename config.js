// Site installation MUST update these to something unique to that site.
let JWT_SECRET = 'sossbox_secret'
let ALLOW_REGISTER = true

// Site installation SHOULD probably update these to something appropriate for that site.
let NAME = 'SOSSBox Server'
let DOMAIN = 'sossbox.com'
let PORT = 23232
let DATA = './data'

// Site installation CAN update these to something else if the effects are understood.
let HOST = '0.0.0.0'
let ID = 'sossbox'


///////////////////////////////////////////////////////////////////////////

// Sites should not modify any of this code below.
if (process.env.JWT_SECRET) {
  JWT_SECRET = process.env.JWT_SECRET.trim();
}
if (process.env.ALLOW_REGISTER) {
  ALLOW_REGISTER = process.env.ALLOW_REGISTER.trim() === 'true';
}
if (process.env.NAME) {
  NAME = process.env.NAME.trim();
}
if (process.env.DOMAIN) {
  DOMAIN = process.env.DOMAIN.trim();
}
if (process.env.PORT) {
  PORT = process.env.PORT.trim();
}
if (process.env.DATA) {
  DATA = process.env.DATA.trim();
}
if (process.env.HOST) {
  HOST = process.env.HOST.trim();
}
if (process.env.ID) {
  ID = process.env.ID.trim();
}

module.exports = { JWT_SECRET, ALLOW_REGISTER, NAME, DOMAIN, DATA, PORT, HOST, ID };
