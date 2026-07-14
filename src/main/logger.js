/**
 * @file Application logger (electron-log).
 *
 * Writes to the console in development and to a rotating file in production
 * (userData/logs/main.log). Import the default export and use it in place of
 * `console` throughout the main process.
 */

import log from 'electron-log/main'

log.initialize()
log.transports.console.level = 'debug'
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024 // rotate at 5 MB

export default log
