'use strict';


//---------//
// Imports //
//---------//

const bPromise = require('bluebird');

const appConfig = require('./app-config.js')
  , bFs = bPromise.promisifyAll(require('fs'))
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
  ;



//------//
// Init //
//------//

const mutableSet = getMutableSet();

const letsencryptDir = path.join(__dirname, 'lets-encrypt');
mkdirp.sync(letsencryptDir);

const { pathToCert, pathToKey } = appConfig;

const argv = minimist(process.argv.slice(2))
  , bExec = childProcessPromise.exec
  , fileServer = new nodeStatic.Server(letsencryptDir)
  , gid = 0
  , highlight = chalk.green
  , invoke = getInvoke()
  , isHttp = argv.isHttp
  , miscMusicPort = 8888
  , proxy = httpProxy.createProxyServer()
  , publicRouterPort = (isHttp) ? 8123: 8234
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

if (!isHttp && !(pathToCert && pathToKey))
  throw new Error("pathToCert and pathToKey are mandatory with https")


//------//
// Main //
//------//


let run = initBeerkbS2r();

if (isHttp) {
  run = run.then(() => {
    router = http.createServer((req, res) => {
      handleRequest(getDomainWithoutTopLevelFromHost(req.headers.host), req, res);
    });
  });
} else {
  run = run.then(() => Promise.all([
      bFs.readFileAsync(pathToCert)
      , bFs.readFileAsync(pathToKey)
    ]))
    .then(([cert, key]) => {
      router = https.createServer({ cert, key }, (req, res) => {
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
    .listen(8123);

  console.log('http -> https redirect server listening on port ' + highlight('8123'));
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

function ensureCorrectDomainAndAuthorized(ctx, next) {
  const domainWithoutTopLevel = getDomainWithoutTopLevelFromHost(ctx.req.headers.host);

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
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack').getRequestListener(beerkbS2r.port, letsencryptDir);
        }
      }
      , {
        domain: 'test.beerkb'
        , nick: 'beerkbTest'
        , dir: 'beerkb/test/'
        , setRequestListener() {
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack').getRequestListener(beerkbS2r.port, letsencryptDir);
        }
      },
      {
        domain: 'home.philipolsonm'
        , nick: 'home'
        , dir: 'philipolsonm/home/'
        , setRequestListener() {
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack').getRequestListener(letsencryptDir);
        }
      },
      {
        domain: 'home-test.philipolsonm'
        , nick: 'homeTest'
        , dir: 'philipolsonm/home-test/'
        , setRequestListener() {
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack').getRequestListener(letsencryptDir);
        }
      },
      {
        domain: 'twearch.philipolsonm'
        , nick: 'twearch'
        , dir: 'philipolsonm/twearch/'
        , setRequestListener() {
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack')
            .getRequestListener(letsencryptDir, router, this.domain + '.com');
        }
      },
      {
        domain: 'tweet-ticker-test.philipolsonm'
        , nick: 'tweetTickerTest'
        , dir: 'philipolsonm/tweet-ticker-test/'
        , setRequestListener() {
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack')
            .getRequestListener(letsencryptDir, router, this.domain + '.com');
        }
      },
      {
        domain: 'tweet-ticker.philipolsonm'
        , nick: 'tweetTicker'
        , dir: 'philipolsonm/tweet-ticker/'
        , setRequestListener() {
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack')
            .getRequestListener(letsencryptDir, router, this.domain + '.com');
        }
      },
      {
        domain: 'weather-accuracy.philipolsonm'
        , nick: 'weatherAccuracy'
        , dir: 'philipolsonm/weather-accuracy/'
        , setRequestListener() {
          this.requestListener = require('./public-apps/' + this.dir + 'index.pack')
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
