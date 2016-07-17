'use strict';


//---------//
// Imports //
//---------//

const fp = require('lodash/fp');


//------//
// Init //
//------//

const capIteratee = getCapIteratee()
  , forEachWithKey = capIteratee(2, fp.forEach.convert({ cap: false }))
  ;


//-------------//
// Helper Fxns //
//-------------//

function getCapIteratee() {
  return fp.curry((cap, fn) =>
    fp.curryN(fn.length, (iteratee, ...args) =>
      fn.apply(null, [fp.ary(cap, iteratee)].concat(args))
    )
  );
}


//---------//
// Exports //
//---------//

module.exports = {
  forEachWithKey
};
