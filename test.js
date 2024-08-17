const path = require('node:path')

const Koa = require("koa");
const serve = require("koa-static");
const Router = require('@koa/router');

const app = new Koa();
const router = new Router();

app.use(serve("public"));
app.use(serve(path.join(__dirname, '/public')))

router.get('/api/:arg', (ctx) => {
  console.log("api path: "+ctx.path, ctx.params);
  // ctx.router available
  ctx.body = 'You have reached the API server at path: '+ctx.path;
});

app
  .use(router.routes());
  .use(router.allowedMethods());

app.listen(3000);

console.log("listening on port 3000");
