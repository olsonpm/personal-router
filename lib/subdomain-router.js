'use strict';


//---------//
// Imports //
//---------//

const koaPlugins = {
    convert: require('koa-convert')
    , proxy: require('koa-proxy')
    , subdomain: require('koa-subdomain')()
  }
  , utils = require('./utils')
  ;


//------//
// Init //
//------//

const subdomainToPortConfig = {
    home: 8000
  }
  , { forEachWithKey } = utils
  ;


//------//
// Main //
//------//

function subdomainRouter() {
  forEachWithKey(routeSubdomain, subdomainToPortConfig);

  return koaPlugins.convert(
    koaPlugins.subdomain.routes()
  );
}


//-------------//
// Helper Fxns //
//-------------//

function routeSubdomain(port, subdomain) {
  koaPlugins.subdomain.use(
    subdomain
    , koaPlugins.proxy({ host: `http://localhost:${port}`})
  );
}


//---------//
// Exports //
//---------//

module.exports = subdomainRouter;
