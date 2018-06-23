//
// README
//  - This file only exists because date-fns alpha was buggy and I wanted an fp
//    interface to its functions
//

//---------//
// Imports //
//---------//

const {
  addDays: _addDays,
  differenceInMilliseconds: _differenceInMilliseconds,
  format: _format,
  setHours: _setHours,
  startOfHour: _startOfHour,
} = require('date-fns')

//
//------//
// Main //
//------//

const addDays = numberOfDays => aDate => _addDays(aDate, numberOfDays)

const differenceInMillisecondsFrom = earlierDate => laterDate =>
  _differenceInMilliseconds(laterDate, earlierDate)

const format = formatString => aDate => _format(aDate, formatString)

const setHour = hour => aDate => _setHours(aDate, hour)

const startOfHour = aDate => _startOfHour(aDate)

//
//---------//
// Exports //
//---------//

module.exports = { addDays, differenceInMillisecondsFrom, format, setHour, startOfHour }
