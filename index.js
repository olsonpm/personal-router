'use strict';


//---------//
// Imports //
//---------//

const bPromise = require('bluebird');

const bFs = bPromise.promisifyAll(require('fs'))
  , chalk = require('chalk')
  , childProcessPromise = require('child-process-promise')
  , http = require('http')
  , https = require('https')
  , Koa = require('koa')
  , koaRouter = require('koa-router')()
  , koaStatic = require('koa-static')
  , minimist = require('minimist')
  , mkdirp = require('mkdirp')
  , nodeStatic = require('node-static')
  , path = require('path')
  , httpProxy = require('http-proxy')
  , r = require('ramda')
  , requireReload = require('require-reload')
  ;



//------//
// Init //
//------//

const mutableSet = getMutableSet();

const letsencryptDir = path.join(__dirname, 'lets-encrypt');
mkdirp.sync(letsencryptDir);

const PERSONAL_ROUTER_PFX = process.env.PERSONAL_ROUTER_PFX
  , PERSONAL_HOTRELOAD_PFX = process.env.PERSONAL_HOTRELOAD_PFX
  ;


const argv = minimist(process.argv.slice(2))
  , bExec = childProcessPromise.exec
  , fileServer = new nodeStatic.Server(letsencryptDir)
  , gid = 0
  , hotreloadApp = new Koa()
  , highlight = chalk.green
  , invoke = getInvoke()
  , isHttp = argv.isHttp
  , miscMusicPort = 8888
  , proxy = httpProxy.createProxyServer()
  , publicRouterPort = (isHttp) ? 80: 443
  , publicHotreloadPort = 8443
  , reload = requireReload(require)
  , rootRedirect = getRootRedirect()
  , strStartsWith = getStrStartsWith()
  , uid = 0
  ;

const publicApps = getPublicApps();

const domainToNick = r.pipe(
  r.map(r.prop(['domain']))
  , r.invertObj
)(publicApps);

const handleRequest = (domainWithoutToplevel, req, res) => {
  // misc-music is a special case.  Also django apparently has a really hard time
  //   either supporting hidden files or documenting said support, because I
  //   couldn't find a lick of information on it.  That means I have to hack
  //   around an ssl solution just for misc-music, unless I want to cleverly
  //   forward its request to an nginx server, who will cleverly forward it
  //   to gunicorn, who will finally have python handle the stupid thing.
  if (domainWithoutToplevel === 'misc-music.philipolsonm') {
    if (strStartsWith(req.url, '/.well-known')) {
      fileServer.serve(req, res);
    } else {
      proxy.web(
        req
        , res
        , { target: `http://localhost:${miscMusicPort}` }
        , e => console.error(e)
      );
    }
  } else if (domainWithoutToplevel === 'philipolsonm') {
    rootRedirect(req, res);
  } else {
    return r.pathOr(send404, [domainToNick[domainWithoutToplevel], 'requestListener'], publicApps)(req, res);
  }
};

let beerkbS2r
  , router
  ;

if (!isHttp && !PERSONAL_ROUTER_PFX)
  throw new Error("environment variable 'PERSONAL_ROUTER_PFX' must be set");

if (!isHttp && !PERSONAL_HOTRELOAD_PFX)
  throw new Error("environment variable 'PERSONAL_HOTRELOAD_PFX' must be set");


//------//
// Main //
//------//

if (!isHttp) initHotreloadServer();

let run = initBeerkbS2r();

if (isHttp) {
  run = run.then(() => {
    router = http.createServer((req, res) => {
      handleRequest(getDomainWithoutTopLevelFromHost(req.headers.host), req, res);
    });
  });
} else {
  run = run.then(() => bFs.readFileAsync(PERSONAL_ROUTER_PFX))
    .then(pfx => {
      router = https.createServer({ pfx }, (req, res) => {
        handleRequest(getDomainWithoutTopLevelFromHost(req.headers.host), req, res);
      });
    });
}

run.then(initPublicApps)
  .then(() => {
    router.listen(publicRouterPort);
    console.log('public router listening on port ' + highlight(publicRouterPort));
  });

if (!isHttp) {
  (new Koa()).use(koaStatic(letsencryptDir, { hidden: true }))
    .use(ctx => {
      const domainWithoutTopLevel = getDomainWithoutTopLevelFromHost(ctx.req.headers.host);
      return redirectOr404(domainWithoutTopLevel, ctx);
    })
    .listen(80);

  console.log('http -> https redirect server listening on port ' + highlight('80'));
}

//-------------//
// Helper Fxns //
//-------------//

const httpsRedirect = r.curry(
  (domain, ctx) => { ctx.status = 308; return ctx.redirect(`https://${domain}.com`); }
);
const domainsToHttpsRedirect = r.pipe(
  r.values
  , r.map(r.prop('domain'))
  , r.concat(['misc-music', 'twearch'])
  , r.reduce(
    (res, cur) => mutableSet(cur, httpsRedirect(cur), res)
    , {}
  )
  , r.merge({ philipolsonm: httpsRedirect('philipolsonm') })
)(publicApps);

const koa404 = r.always(void 0);

function redirectOr404(domainWithoutToplevel, ctx) {
  return r.propOr(koa404, domainWithoutToplevel, domainsToHttpsRedirect)(ctx);
}

function initHotreloadServer() {
  r.pipe(
    r.values
    , r.forEach(
      app => koaRouter.post(
        '/' + app.nick
        , (ctx, next) => {
          return bExec('git pull', {
              cwd: path.join(__dirname, 'public-apps', app.dir)
              , uid: 0
              , gid: 0
            })
            .then(() => {
              publicApps[app.nick].setRequestListener();
              ctx.body = app.nick + ' reloaded successfully';
            })
            .catch(err => {
              ctx.body = app.nick + ' was unable to reload: ' + err;
              ctx.status = 500;
            })
            .then(next);
        }
      )
    )
  )(publicApps);

  koaRouter.post(
    '/beerkbS2r'
    , (ctx, next) => {
      return beerkbS2r.server.destroy()
        .then(() => bExec('git pull', {
          cwd: path.join(__dirname, 'internal-servers/beerkb-internal-s2r')
          , uid
          , gid
        }))
        .then(initBeerkbS2r)
        .then(() => {
          publicApps.beerkb.setRequestListener();
          publicApps.beerkbTest.setRequestListener();
          ctx.body = 'beerkbS2r, beerkb and beerkbTest reloaded successfully';
          return next();
        });
    }
  );

  const hotreloadRequestHandler = hotreloadApp.use(ensureCorrectDomainAndAuthorized)
    .use(koaRouter.routes())
    .use(koaRouter.allowedMethods())
    .callback();

  return bFs.readFileAsync(PERSONAL_HOTRELOAD_PFX)
    .then(pfx => {
      https.createServer({ requestCert: true, rejectUnauthorized: true, pfx }, hotreloadRequestHandler)
        .listen(publicHotreloadPort);

      console.log('hotreload server listening on port ' + highlight(publicHotreloadPort));
    });
}

function ensureCorrectDomainAndAuthorized(ctx, next) {
  const domainWithoutTopLevel = getDomainWithoutTopLevelFromHost(ctx.req.headers.host);

  // TODO: find out if this is necessary.  I think any calls outside of this
  //   domain will be unauthorized.
  if (domainWithoutTopLevel !== 'hotreload.philipolsonm') {
    ctx.status = 404;
    return;
  }

  return next();
}

function initBeerkbS2r() {
  return require('./internal-servers/beerkb-internal-s2r/server').run()
    .then(beerkbS2r_ => {
      beerkbS2r = beerkbS2r_;
    });
}

function initPublicApps() {
  r.forEach(invoke('setRequestListener'), r.values(publicApps));
}

function getPublicApps() {
  return r.indexBy(
    r.prop('nick')
    , [
      {
        domain: 'beerkb'
        , nick: 'beerkb'
        , dir: 'beerkb/prod/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack').getRequestListener(beerkbS2r.port, letsencryptDir);
        }
      }
      , {
        domain: 'test.beerkb'
        , nick: 'beerkbTest'
        , dir: 'beerkb/test/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack').getRequestListener(beerkbS2r.port, letsencryptDir);
        }
      },
      {
        domain: 'home.philipolsonm'
        , nick: 'home'
        , dir: 'philipolsonm/home/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack').getRequestListener(letsencryptDir);
        }
      },
      {
        domain: 'home-test.philipolsonm'
        , nick: 'homeTest'
        , dir: 'philipolsonm/home-test/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack').getRequestListener(letsencryptDir);
        }
      },
      {
        domain: 'twearch.philipolsonm'
        , nick: 'twearch'
        , dir: 'philipolsonm/twearch/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack')
            .getRequestListener(letsencryptDir, router, this.domain + '.com');
        }
      },
      {
        domain: 'tweet-ticker-test.philipolsonm'
        , nick: 'tweetTickerTest'
        , dir: 'philipolsonm/tweet-ticker-test/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack')
            .getRequestListener(letsencryptDir, router, this.domain + '.com');
        }
      },
      {
        domain: 'tweet-ticker.philipolsonm'
        , nick: 'tweetTicker'
        , dir: 'philipolsonm/tweet-ticker/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack')
            .getRequestListener(letsencryptDir, router, this.domain + '.com');
        }
      },
      {
        domain: 'weather-accuracy.philipolsonm'
        , nick: 'weatherAccuracy'
        , dir: 'philipolsonm/weather-accuracy/'
        , setRequestListener() {
          this.requestListener = reload('./public-apps/' + this.dir + 'index.pack')
            .getRequestListener(letsencryptDir);
        }
      }
    ]
  );
}

function getDomainWithoutTopLevelFromHost(host) {
  if (!host) return '';

  let i = host.length
    , done = false
    ;

  while(i > 0 && !done) {
    if (host[i] === '.') done = true;
    else i-=1;
  }

  if (i === 0) i = host.length;

  return host.slice(0, i);
}

function getStrStartsWith() {
  return r.curry((str, startsWith) => {
    if (startsWith.length > str.length) return false;

    let i = 0
      , isSame;

    do {
      isSame = str[i] === startsWith[i];
      i += 1;
    } while(i < startsWith.length && isSame);

    return isSame;
  });
}

function getInvoke() {
  return r.curry(
    (prop, obj) => r.pipe(
      r.prop
      , r.bind(r.__, obj)
      , r.call(r.__, undefined)
    )(prop, obj)
  );
}

function send404(_req, res) {
  res.statusCode = '404';
  res.end('Resource Not Found');
}

function getRootRedirect() {
  const protocol = (isHttp) ? 'http' : 'https'
    , redirectUrl = `${protocol}://home.philipolsonm.com`;

  return (new Koa())
    .use(koaStatic(letsencryptDir, { hidden: true }))
    .use(ctx => {
      ctx.status = 307;
      return ctx.redirect(redirectUrl);
    })
    .callback();
}

function getMutableSet() {
  return r.curry(
    (prop, val, obj) => { obj[prop] = val; return obj; }
  );
}
