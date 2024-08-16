const path = require('path');
const uuid = require('uuid-random');
const multer = require('@koa/multer');

const log = require('./log');
const auth = require('./auth');
const io = require('./io');

const JSON_TYPE = 'application/json; charset=utf-8';

// Upload limits
const ONEMB = 1048576;
const MAX_UPLOAD = 10*ONEMB;

function logRoute(req, err) {
  req.log.info({req, err}, 'route handler');
}

function initRoutes(store) {

  let prefix = (store.api === '/') ? '' : store.api;  // store '/' as an empty string for concatenation

  var diskStorage = multer.diskStorage({
    destination: function (request, file, cb) {
      let user = auth.getAuth(request, store.secret);      
      if (user) {
        let folder = store.userFolder(user.uid, 'assets')
        cb(null, folder);
      } else {
        let err = new Error('Missing user authentication.');
        log.error("Asset Upload "+err);
        cb(err);
      }
    },
    filename: function (request, file, cb) {
      let fn = uuid();
      let ext = path.extname(file.originalname);
      cb(null, fn + ext);
    }
  })
  
  const limits = { fileSize: MAX_UPLOAD, files: 1 };
  const upload = multer({ storage: diskStorage, limits });

  // listener.post('/assets', handleSingleUpload);
  listener.post(prefix+'/assets', { preHandler: upload.single('upload_file') }, async (request, reply) => {
    // request.body will hold the text fields, if there were any
    // request.file is the upload metadata: {
    //   destination:'./uploads'
    //   encoding:'7bit'
    //   fieldname:'upload_file'
    //   filename:'e45a4c6f82a5da26901595ccb0c4dde9'
    //   mimetype:'image/png'
    //   originalname:'logo.png'
    //   path:'uploads\\e45a4c6f82a5da26901595ccb0c4dde9'
    //   size:71627
    // }

    if (!request.file) {
      let err = new Error('Upload is missing file.');
      log.error("Asset Upload "+err);
      reply.code(400).send(err.message);
      return;
    }

    console.log(`Uploaded file: ${request.file.originalname} (${request.file.size}) -> ${request.file.path}`);
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      // This can't really happen because the multer diskStorage instance above would have returned an error building the path.
      // But just in case the implementation changes, handle it.
      await io.pathDelete(request.file.path);
      reply.code(401).send('Not authorized.');
      return;
    }
    let ext = path.extname(request.file.originalname);
    let which = path.basename(request.file.path, ext);
    let meta = {
      id: which,
      filename: request.file.filename,
      originalname: request.file.originalname,
      size: request.file.size,
      mimetype: request.file.mimetype,
      uploaded: Date.now()
    };
    if (ext.toLowerCase() !== '.json') {
      await store.userDocCreate(user.uid, 'assets', which+'.json', meta);
    }
    reply.type(JSON_TYPE).send(meta);
  });

  listener.get(prefix+'/assets/:id', async (request, reply) => {
    try {
      let which = request.params.id;
      let ext = path.extname(which);
      let isJSON = (ext === '.json') ? true : false;
      which = path.basename(which, ext);

      let user = auth.getAuth(request, store.secret);
      if (!user) {
        reply.code(401).send('Not authorized.');
        return;
      }
      let who = user.uid;

      let meta = await store.userDocGet(who, 'assets', which+'.json');
      ext = path.extname(meta.originalname);
      if (isJSON) {
        reply.type(JSON_TYPE).send(meta);
        logRoute(request);
        return;
      }

      let data = await io.fileGet(store.userFolder(who, 'assets'), which+ext, null);  // binary
      // reply.header('Content-disposition', 'attachment; filename=' + meta.originalname);
      reply.header('Content-disposition', 'inline; filename=' + meta.originalname);
      reply.type(meta.mimetype);
      reply.send(data);
      logRoute(request);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`/asset: ${err.message}\n${err.stack}`);
      }
      reply.type(JSON_TYPE).send(JSON.stringify(err));    
      logRoute(request);
    }
  });

  listener.delete(prefix+'/assets/:id', async (request, reply) => {
    try {
      let which = request.params.id;
      let ext = path.extname(which);
      which = path.basename(which, ext);

      if (ext !== '') {
        reply.code(400).send('Asset UUID cannot have an extension.')
        logRoute(request);
        return;
      }

      let user = auth.getAuth(request, store.secret);
      if (!user) {
        reply.code(401).send('Not authorized.');
        return;
      }
      let who = user.uid;

      if (ext !== '.json') {
        let meta = await store.userDocGet(who, 'assets', which+'.json');
        ext = path.extname(meta.originalname);
      }
      let folder = store.userFolder(who, 'assets');
      await io.fileDelete(folder, which+ext);
      await io.fileDelete(folder, which+'.json');
      reply.code(200).send('DELETED');
      logRoute(request);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`/asset: ${err.message}\n${err.stack}`);
      }
      reply.type(JSON_TYPE).send(JSON.stringify(err));    
      logRoute(request);
    }
  });
}

module.exports = { initRoutes };