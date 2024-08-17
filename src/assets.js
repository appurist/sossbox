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

function initRoutes(router, store) {
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

  // router.post('/assets', handleSingleUpload);
  // router.post(prefix+'/assets', { preHandler: upload.single('upload_file') }, async (request, reply) => {
  router.post(prefix + '/assets', async (ctx) => {
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

    if (!ctx.request.file) {
      let err = new Error('Upload is missing file.');
      log.error("Asset Upload "+err);
      ctx.code = 400
      ctx.body = err.message;
      return;
    }

    console.log(`Uploaded file: ${ctx.request.file.originalname} (${ctx.request.file.size}) -> ${ctx.request.file.path}`);
    let user = auth.getAuth(ctx.request, store.secret);
    if (!user) {
      // This can't really happen because the multer diskStorage instance above would have returned an error building the path.
      // But just in case the implementation changes, handle it.
      await io.pathDelete(ctx.request.file.path);
      ctx.code = 401;
      ctx.body = 'Not authorized.';
      return;
    }
    let ext = path.extname(ctx.request.file.originalname);
    let which = path.basename(ctx.request.file.path, ext);
    let meta = {
      id: which,
      filename: ctx.request.file.filename,
      originalname: ctx.request.file.originalname,
      size: ctx.request.file.size,
      mimetype: ctx.request.file.mimetype,
      uploaded: Date.now()
    };
    if (ext.toLowerCase() !== '.json') {
      await store.userDocCreate(user.uid, 'assets', which+'.json', meta);
    }
    ctx.type = JSON_TYPE;
    ctx.body = JSON.stringify(meta);
  });

  router.get(prefix+'/assets/:id', async (ctx) => {
    try {
      let which = ctx.params.id;
      let ext = path.extname(which);
      let isJSON = (ext === '.json') ? true : false;
      which = path.basename(which, ext);

      let user = auth.getAuth(ctx.request, store.secret);
      if (!user) {
        ctx.code = 401;
        ctx.body = 'Not authorized.';
        return;
      }
      let who = user.uid;

      let meta = await store.userDocGet(who, 'assets', which+'.json');
      ext = path.extname(meta.originalname);
      if (isJSON) {
        ctx.type = JSON_TYPE;
        ctx.body = JSON.stringify(meta);
        logRoute(ctx.request);
        return;
      }

      let data = await io.fileGet(store.userFolder(who, 'assets'), which+ext, null);  // binary
      // reply.header('Content-disposition', 'attachment; filename=' + meta.originalname);
      ctx.header['Content-disposition'] = 'inline; filename=' + meta.originalname;
      ctx.type = meta.mimetype;
      ctx.body = JSON.stringify(data);
      logRoute(ctx.request);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`/asset: ${err.message}\n${err.stack}`);
      }
      ctx.type = JSON_TYPE;
      ctx.body = JSON.stringify(err);
      logRoute(ctx.request);
    }
  });

  router.delete(prefix+'/assets/:id', async (ctx) => {
    try {
      let which = ctx.params.id;
      let ext = path.extname(which);
      which = path.basename(which, ext);

      if (ext !== '') {
        ctx.code = 400;
        ctx.body = 'Asset UUID cannot have an extension.';
        logRoute(ctx.request);
        return;
      }

      let user = auth.getAuth(ctx.request, store.secret);
      if (!user) {
        ctx.code = 401;
        ctx.body = 'Not authorized.';
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
      ctx.code = 200;
      ctx.body = 'DELETED';
      logRoute(ctx.request);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`/asset: ${err.message}\n${err.stack}`);
      }
      ctx.type = JSON_TYPE;
      ctx.body = JSON.stringify(err);
      logRoute(ctx.request);
    }
  });
}

module.exports = { initRoutes };
