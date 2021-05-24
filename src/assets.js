const multer = require('fastify-multer') // or import multer from 'fastify-multer'
const auth = require('./auth');

function initRoutes(store) {
  let listener = store.listener;
  listener.register(multer.contentParser)
  const upload = multer({ dest: './uploads' })

  // listener.post('/assets', handleSingleUpload);
  listener.post('/assets', { preHandler: upload.single('upload_file') }, async (request, reply) => {
    // request.file is the upload
    // request.body will hold the text fields, if there were any
    let user = auth.getAuth(request, store.secret);
    if (!user) {
      // This can't really happen because the multer diskStorage instance above would have returned an error building the path.
      // But just in case the implementation changes, handle it.
      await io.pathDelete(request.file.path);
      reply.code(401).send('Not authorized.');
      return;
    }

    if (!request.file) {
      console.warn("Missing file:", request.body, request.file);
      request.log.warn({req: request}, '/assets request, no file provided.');
      reply.code(404).send('File upload not found.');
      return;
    }

    console.log("Uploaded file:", request.body, request.file);
    reply.code(200).send('SUCCESS')
  });
}

module.exports = { initRoutes };