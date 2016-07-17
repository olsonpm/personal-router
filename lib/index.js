'use strict';


//---------//
// Imports //
//---------//

const chalk = require('chalk')
  , Koa = require('koa')
  , minimist = require('minimist')
  , subdomainRouter = require('./subdomain-router')
  ;


//------//
// Init //
//------//

const app = new Koa()
  , argv = minimist(process.argv.slice(2), { default: { ssl: true }})
  , hasSsl = argv.ssl
  , highlight = chalk.green
  , port = hasSsl ? 443 : 80
  ;


//------//
// Main //
//------//

app.use(subdomainRouter())
  .listen(port);

console.log('listening on port ' + highlight(port));
