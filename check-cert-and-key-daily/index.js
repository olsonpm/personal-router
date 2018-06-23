//
// TODO: make this its own repo on github
//

//---------//
// Imports //
//---------//

const fs = require('fs'),
  ms = require('ms')

const {
  addDays,
  differenceInMillisecondsFrom,
  setHour,
  startOfHour,
} = require('./fp_date-fns')

//
//------//
// Init //
//------//

const msInADay = ms('1 day')

//
//------//
// Main //
//------//

const checkCertAndKeyDaily = (server, certAndKeyPaths) => {
  const getCertAndKey = createGetCertAndKey(certAndKeyPaths),
    checkForUpdatedCertAndKeyDaily = createCheckForUpdatedCertAndKeyDaily(
      server,
      getCertAndKey
    )

  let currentCertAndKey = getCertAndKey()

  const nowUtc = getNowUtc(),
    msTil4amCst = passThrough(nowUtc, [
      addDays(1),
      setHour(9), // 9am UTC === 4am CST
      startOfHour,
      differenceInMillisecondsFrom(nowUtc),
    ])

  // at 4am
  waitMs(msTil4amCst).then(() => {
    // start the daily check
    setInterval(() => {
      currentCertAndKey = checkForUpdatedCertAndKeyDaily(currentCertAndKey)
    }, msInADay)
  })

  return currentCertAndKey
}

function createGetCertAndKey({ pathToCert, pathToKey }) {
  return () => ({
    cert: fs.readFileSync(pathToCert),
    key: fs.readFileSync(pathToKey),
  })
}

//
// from here:
// https://stackoverflow.com/a/6777470/984407
//
function getNowUtc() {
  const now = new Date()

  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  )
}

function createCheckForUpdatedCertAndKeyDaily(server, getCertAndKey) {
  return previous => {
    const current = getCertAndKey()
    if (certAndKeyAreEqual(current, previous)) return previous
    // else we have a new cert and key!

    //
    // WARN: the below uses an internal node api and can't be trusted between
    //   versions of node.  However it seems to be the way kids are doing it
    //   these days
    //
    // https://github.com/nodejs/node/issues/4464#issuecomment-296467506
    //
    server._sharedCreds.context.setCert(current.cert)
    server._sharedCreds.context.setKey(current.key)
    return current
  }
}

function certAndKeyAreEqual(current, previous) {
  return current.cert.equals(previous.cert) && current.key.equals(previous.key)
}

//
//------------------//
// Helper Functions //
//------------------//

function passThrough(arg, functionArray) {
  return functionArray.reduce((result, aFunction) => aFunction(result), arg)
}

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

//
//---------//
// Exports //
//---------//

module.exports = checkCertAndKeyDaily
