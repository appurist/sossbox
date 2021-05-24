const path = require('path');
const multer = require('fastify-multer') // or import multer from 'fastify-multer'
const uuid = require('uuid-random');

const log = require('./log');
const auth = require('./auth');
const io = require('./io');

// Upload limits
const ONEMB = 1048576;
const MAX_UPLOAD = 10*ONEMB;

function initRoutes(store) {
  let listener = store.listener;
  listener.register(multer.contentParser)

  var diskStorage = multer.diskStorage({
    destination: function (request, file, cb) {
      let user = auth.getAuth(request, store.secret);      
      if (user) {
        let folder = store.userFolder(user.uid, 'assets')
        console.log("upload dest -> ", folder);
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
  listener.post('/assets', { preHandler: upload.single('upload_file') }, async (request, reply) => {
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
    if (ext.toLowerCase() !== '.json') {
      let which = path.basename(request.file.path, ext);
      let meta = {
        filename: request.file.filename,
        originalname: request.file.originalname,
        size: request.file.size,
        mimetype: request.file.mimetype,
        uploaded: Date.now()
      };
      await store.userDocCreate(user.uid, 'assets', which+'.json', meta);
    }
    reply.code(200).send('SUCCESS');
  });
}

module.exports = { initRoutes };