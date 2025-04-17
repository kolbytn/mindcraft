// @ts-nocheck
const { Vec3 } = require('vec3')

class Move extends Vec3 {
  constructor (x, y, z, remainingBlocks, cost, toBreak = [], toPlace = [], parkour = false) {
    super(Math.floor(x), Math.floor(y), Math.floor(z))
    this.remainingBlocks = remainingBlocks
    this.cost = cost
    this.toBreak = toBreak
    this.toPlace = toPlace
    this.parkour = parkour

    this.hash = this.x + ',' + this.y + ',' + this.z
  }
}

module.exports = Move
