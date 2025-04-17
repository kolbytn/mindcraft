// @ts-nocheck
const { Vec3 } = require('vec3')
const { getShapeFaceCenters } = require('./shapes')

// Goal base class
class Goal {
  // Return the distance between node and the goal
  heuristic (node) {
    return 0
  }

  // Return true if the node has reach the goal
  isEnd (node) {
    return true
  }

  // Return true if the goal has changed and the current path
  // should be invalidated and computed again
  hasChanged () {
    return false
  }

  // Returns true if the goal is still valid for the goal,
  // for the GoalFollow this would be true if the entity is not null
  isValid () {
    return true
  }
}

// One specific block that the player should stand inside at foot level
class GoalBlock extends Goal {
  constructor (x, y, z) {
    super()
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return distanceXZ(dx, dz) + Math.abs(dy)
  }

  isEnd (node) {
    return node.x === this.x && node.y === this.y && node.z === this.z
  }
}

// A block position that the player should get within a certain radius of, used for following entities
class GoalNear extends Goal {
  constructor (x, y, z, range) {
    super()
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
    this.rangeSq = range * range
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return distanceXZ(dx, dz) + Math.abs(dy)
  }

  isEnd (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return (dx * dx + dy * dy + dz * dz) <= this.rangeSq
  }
}

// Useful for long-range goals that don't have a specific Y level
class GoalXZ extends Goal {
  constructor (x, z) {
    super()
    this.x = Math.floor(x)
    this.z = Math.floor(z)
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dz = this.z - node.z
    return distanceXZ(dx, dz)
  }

  isEnd (node) {
    return node.x === this.x && node.z === this.z
  }
}

// Useful for finding builds that you don't have an exact Y level for, just an approximate X and Z level
class GoalNearXZ extends Goal {
  constructor (x, z, range) {
    super()
    this.x = Math.floor(x)
    this.z = Math.floor(z)
    this.rangeSq = range * range
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dz = this.z - node.z
    return distanceXZ(dx, dz)
  }

  isEnd (node) {
    const dx = this.x - node.x
    const dz = this.z - node.z
    return (dx * dx + dz * dz) <= this.rangeSq
  }
}

// Goal is a Y coordinate
class GoalY extends Goal {
  constructor (y) {
    super()
    this.y = Math.floor(y)
  }

  heuristic (node) {
    const dy = this.y - node.y
    return Math.abs(dy)
  }

  isEnd (node) {
    return node.y === this.y
  }
}

// Don't get into the block, but get directly adjacent to it. Useful for chests.
class GoalGetToBlock extends Goal {
  constructor (x, y, z) {
    super()
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
  }

  heuristic (node) {
    const dx = node.x - this.x
    const dy = node.y - this.y
    const dz = node.z - this.z
    return distanceXZ(dx, dz) + Math.abs(dy < 0 ? dy + 1 : dy)
  }

  isEnd (node) {
    const dx = node.x - this.x
    const dy = node.y - this.y
    const dz = node.z - this.z
    return Math.abs(dx) + Math.abs(dy < 0 ? dy + 1 : dy) + Math.abs(dz) === 1
  }
}

// Path into a position were a blockface of block at x y z is visible.
class GoalLookAtBlock extends Goal {
  constructor (pos, world, options = {}) {
    super()
    this.pos = pos
    this.world = world
    this.reach = options.reach || 4.5 // default survival: 4.5 creative: 5
    this.entityHeight = options.entityHeight || 1.6
  }

  heuristic (node) {
    const dx = node.x - this.pos.x
    const dy = node.y - this.pos.y
    const dz = node.z - this.pos.z
    return distanceXZ(dx, dz) + Math.abs(dy < 0 ? dy + 1 : dy)
  }

  isEnd (node) {
    if (node.distanceTo(this.pos.offset(0, this.entityHeight, 0)) > this.reach) return false
    // Check faces that could be seen from the current position. If the delta is smaller then 0.5 that means the bot cam most likely not see the face as the block is 1 block thick
    // this could be false for blocks that have a smaller bounding box then 1x1x1
    const dx = node.x - (this.pos.x + 0.5)
    const dy = node.y + this.entityHeight - (this.pos.y + 0.5) // -0.5 because the bot position is calculated from the block position that is inside its feet so 0.5 - 1 = -0.5
    const dz = node.z - (this.pos.z + 0.5)
    // Check y first then x and z
    const visibleFaces = {
      y: Math.sign(Math.abs(dy) > 0.5 ? dy : 0),
      x: Math.sign(Math.abs(dx) > 0.5 ? dx : 0),
      z: Math.sign(Math.abs(dz) > 0.5 ? dz : 0)
    }
    const validFaces = []
    for (const i in visibleFaces) {
      if (!visibleFaces[i]) {
        // skip as this face is not visible
        continue
      }
      const targetPos = new Vec3(this.pos.x, this.pos.y, this.pos.z).offset(0.5 + (i === 'x' ? visibleFaces[i] * 0.5 : 0), 0.5 + (i === 'y' ? visibleFaces[i] * 0.5 : 0), 0.5 + (i === 'z' ? visibleFaces[i] * 0.5 : 0))
      const startPos = new Vec3(node.x + 0.5, node.y + this.entityHeight, node.z + 0.5)
      const rayPos = this.world.raycast(startPos, targetPos.clone().subtract(startPos).normalize(), this.reach)?.position
      if (rayPos && rayPos.x === this.pos.x && rayPos.y === this.pos.y && rayPos.z === this.pos.z) {
        validFaces.push({
          face: rayPos.face,
          targetPos
        })
      }
    }
    return validFaces.length !== 0
  }
}

// Path into a position were a blockface of block at x y z is visible.
// You'll manually need to break the block. THIS WONT BREAK IT
class GoalBreakBlock extends Goal {
  constructor (x, y, z, bot, options = {}) {
    super()
    this.goal = new GoalLookAtBlock(new Vec3(x, y, z), bot, options)
  }

  isEnd (node) {
    return this.goal.isEnd(node)
  }

  heuristic (node) {
    return this.goal.heuristic(node)
  }
}

// A composite of many goals, any one of which satisfies the composite.
// For example, a GoalCompositeAny of block goals for every oak log in loaded
// chunks would result in it pathing to the easiest oak log to get to
class GoalCompositeAny extends Goal {
  constructor (goals = []) {
    super()
    this.goals = goals
  }

  push (goal) {
    this.goals.push(goal)
  }

  heuristic (node) {
    let min = Number.MAX_VALUE
    for (const i in this.goals) {
      min = Math.min(min, this.goals[i].heuristic(node))
    }
    return min
  }

  isEnd (node) {
    for (const i in this.goals) {
      if (this.goals[i].isEnd(node)) return true
    }
    return false
  }

  hasChanged () {
    for (const i in this.goals) {
      if (this.goals[i].hasChanged()) return true
    }
    return false
  }

  isValid () {
    return this.goals.reduce((pre, curr) => pre && curr.isValid(), true)
  }
}

// A composite of many goals, all of them needs to be satisfied.
class GoalCompositeAll extends Goal {
  constructor (goals = []) {
    super()
    this.goals = goals
  }

  push (goal) {
    this.goals.push(goal)
  }

  heuristic (node) {
    let max = Number.MIN_VALUE
    for (const i in this.goals) {
      max = Math.max(max, this.goals[i].heuristic(node))
    }
    return max
  }

  isEnd (node) {
    for (const i in this.goals) {
      if (!this.goals[i].isEnd(node)) return false
    }
    return true
  }

  hasChanged () {
    for (const i in this.goals) {
      if (this.goals[i].hasChanged()) return true
    }
    return false
  }

  isValid () {
    return this.goals.reduce((pre, curr) => pre && curr.isValid(), true)
  }
}

class GoalInvert extends Goal {
  constructor (goal) {
    super()
    this.goal = goal
  }

  heuristic (node) {
    return -this.goal.heuristic(node)
  }

  isEnd (node) {
    return !this.goal.isEnd(node)
  }

  hasChanged () {
    return this.goal.hasChanged()
  }

  isValid () {
    return this.goal.isValid()
  }
}

class GoalFollow extends Goal {
  constructor (entity, range) {
    super()
    this.entity = entity
    this.x = Math.floor(entity.position.x)
    this.y = Math.floor(entity.position.y)
    this.z = Math.floor(entity.position.z)
    this.rangeSq = range * range
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return distanceXZ(dx, dz) + Math.abs(dy)
  }

  isEnd (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return (dx * dx + dy * dy + dz * dz) <= this.rangeSq
  }

  hasChanged () {
    const p = this.entity.position.floored()
    const dx = this.x - p.x
    const dy = this.y - p.y
    const dz = this.z - p.z
    if ((dx * dx + dy * dy + dz * dz) > this.rangeSq) {
      this.x = p.x
      this.y = p.y
      this.z = p.z
      return true
    }
    return false
  }

  isValid () {
    return this.entity != null
  }
}

function distanceXZ (dx, dz) {
  dx = Math.abs(dx)
  dz = Math.abs(dz)
  return Math.abs(dx - dz) + Math.min(dx, dz) * Math.SQRT2
}

/**
 * Options:
 * - range - maximum distance from the clicked face
 * - faces - the directions of the faces the player can click
 * - facing - the direction the player must be facing
 * - facing3D - boolean, facing is 3D (true) or 2D (false)
 * - half - 'top' or 'bottom', the half that must be clicked
 * - LOS - true or false, should the bot have line of sight off the placement face. Default true.
 */
class GoalPlaceBlock extends Goal {
  constructor (pos, world, options) {
    super()
    this.pos = pos.floored()
    this.world = world
    this.options = options
    if (!this.options.range) this.options.range = 5
    if (!('LOS' in this.options)) this.options.LOS = true
    if (!this.options.faces) {
      this.options.faces = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)]
    }
    this.options.facing = ['north', 'east', 'south', 'west', 'up', 'down'].indexOf(this.options.facing)
    this.facesPos = []
    for (const dir of this.options.faces) {
      const ref = this.pos.plus(dir)
      const refBlock = this.world.getBlock(ref)
      if (!refBlock) continue
      for (const center of getShapeFaceCenters(refBlock.shapes, dir.scaled(-1), this.options.half)) {
        this.facesPos.push([dir, center.add(ref), ref])
      }
    }
  }

  heuristic (node) {
    const dx = node.x - this.pos.x
    const dy = node.y - this.pos.y
    const dz = node.z - this.pos.z
    return distanceXZ(dx, dz) + Math.abs(dy < 0 ? dy + 1 : dy)
  }

  isEnd (node) {
    if (this.isStandingIn(node)) return false
    const headPos = node.offset(0.5, 1.6, 0.5)
    return this.getFaceAndRef(headPos) !== null
  }

  getFaceAndRef (headPos) {
    for (const [face, to, ref] of this.facesPos) {
      const dir = to.minus(headPos)
      if (dir.norm() > this.options.range) continue
      if (!this.checkFacing(dir)) continue

      if (!this.options.LOS) {
        return { face, to, ref }
      }

      const block = this.world.raycast(headPos, dir.normalize(), this.options.range)
      if (block && block.position.equals(ref) && block.face === vectorToDirection(face.scaled(-1))) {
        return { face, to, ref }
      }
    }
    return null
  }

  checkFacing (dir) {
    if (this.options.facing < 0) return true

    if (this.options.facing3D) {
      const dH = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
      const vAngle = Math.atan2(dir.y, dH) * 180 / Math.PI
      if (vAngle > 45) return this.options.facing === 4
      if (vAngle < -45) return this.options.facing === 5
    }
    const angle = Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 180 // Convert to [0,360[
    const facing = Math.floor(angle / 90 + 0.5) & 0x3

    if (this.options.facing === facing) return true
    return false
  }

  isStandingIn (node) {
    const dx = node.x - this.pos.x
    const dy = node.y - this.pos.y
    const dz = node.z - this.pos.z
    return (Math.abs(dx) + Math.abs(dy < 0 ? dy + 1 : dy) + Math.abs(dz)) < 1
  }
}

function vectorToDirection (v) {
  if (v.y < 0) {
    return 0
  } else if (v.y > 0) {
    return 1
  } else if (v.z < 0) {
    return 2
  } else if (v.z > 0) {
    return 3
  } else if (v.x < 0) {
    return 4
  } else if (v.x > 0) {
    return 5
  }
}

module.exports = {
  Goal,
  GoalBlock,
  GoalNear,
  GoalXZ,
  GoalNearXZ,
  GoalY,
  GoalGetToBlock,
  GoalCompositeAny,
  GoalCompositeAll,
  GoalInvert,
  GoalFollow,
  GoalPlaceBlock,
  GoalBreakBlock,
  GoalLookAtBlock
}
