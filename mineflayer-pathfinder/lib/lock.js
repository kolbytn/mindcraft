// @ts-nocheck
const { EventEmitter, on } = require('events')

class Lock {
  constructor () {
    this._locked = false
    this._emitter = new EventEmitter()
  }

  /**
   * Synchronous. Returns true if the lock was acquired. Return false if the lock is already held by something else.
   * @returns {boolean}
   */
  tryAcquire () {
    if (!this._locked) {
      this._locked = true
      return true
    }
    return false
  }

  /**
   * Asynchronous. Resolves when the lock was acquired.
   * @returns {Promise<void>}
   */
  async acquire () {
    if (!this._locked) {
      this._locked = true
      return
    }

    // Cannot use for await without a variable. But the variable is never used. So eslint complains ¯\_(ツ)_/¯
    for await (const _ of on(this._emitter, 'release')) { // eslint-disable-line
      if (!this._locked) {
        this._locked = true
        return
      }
    }
  }

  /**
   * Releases the lock.
   */
  release () {
    this._locked = false
    setImmediate(() => this._emitter.emit('release'))
  }
}

module.exports = Lock
