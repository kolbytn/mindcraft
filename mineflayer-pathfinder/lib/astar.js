// @ts-nocheck
const { performance } = require('perf_hooks')

const Heap = require('./heap.js')

class PathNode {
  constructor () {
    this.data = null
    this.g = 0
    this.h = 0
    this.f = 0
    this.parent = null
  }

  set (data, g, h, parent = null) {
    this.data = data
    this.g = g
    this.h = h
    this.f = g + h
    this.parent = parent
    return this
  }
}

function reconstructPath (node) {
  const path = []
  while (node.parent) {
    path.push(node.data)
    node = node.parent
  }
  return path.reverse()
}

class AStar {
  constructor (start, movements, goal, timeout, tickTimeout = 40, searchRadius = -1) {
    this.startTime = performance.now()

    this.movements = movements
    this.goal = goal
    this.timeout = timeout
    this.tickTimeout = tickTimeout

    this.closedDataSet = new Set()
    this.openHeap = new Heap()
    this.openDataMap = new Map()

    const startNode = new PathNode().set(start, 0, goal.heuristic(start))
    this.openHeap.push(startNode)
    this.openDataMap.set(startNode.data.hash, startNode)
    this.bestNode = startNode

    this.maxCost = searchRadius < 0 ? -1 : startNode.h + searchRadius
    this.visitedChunks = new Set()
  }

  makeResult (status, node) {
    return {
      status,
      cost: node.g,
      time: performance.now() - this.startTime,
      visitedNodes: this.closedDataSet.size,
      generatedNodes: this.closedDataSet.size + this.openHeap.size(),
      path: reconstructPath(node),
      context: this
    }
  }

  /**
   * Computes the path for the bot to follow using the A* algorithm.
   * 
   * This method controls the bot's pathfinding by processing nodes in the open heap
   * until a path to the goal is found, the computation times out, or no path is available.
   * 
   * The method operates in a loop, performing the following steps:
   * 1. Checks if the current tick has exceeded the allowed time (`tickTimeout`).
   * 2. Checks if the total computation time has exceeded the overall timeout (`timeout`).
   * 3. Pops the node with the lowest cost from the open heap.
   * 4. Checks if the current node is the goal.
   * 5. Moves the current node from the open set to the closed set.
   * 6. Retrieves all valid neighboring nodes.
   * 7. For each neighbor:
   *    - Skips neighbors already in the closed set.
   *    - Calculates the cost from the start node to this neighbor.
   *    - Adds the neighbor to the open set if it's not already there, or updates it if it has a lower cost.
   * 
   * The method returns a result object containing the status of the pathfinding operation,
   * the cost, time taken, number of visited and generated nodes, the path, and the context.
   * 
   * @returns {Object} The result of the pathfinding operation.
   */
  compute () {
    // Start the compute timer
    const computeStartTime = performance.now()

    // Main loop: process nodes until the open heap is empty
    while (!this.openHeap.isEmpty()) {
      // Check if the current tick has exceeded the allowed time
      if (performance.now() - computeStartTime > this.tickTimeout) {
        return this.makeResult('partial', this.bestNode)
      }

      // Check if the total computation time has exceeded the timeout
      if (performance.now() - this.startTime > this.timeout) {
        return this.makeResult('timeout', this.bestNode)
      }

      // Get the node with the lowest cost from the open heap
      const node = this.openHeap.pop()

      // Check if the current node is the goal
      if (this.goal.isEnd(node.data)) {
        return this.makeResult('success', node)
      }

      // Move the current node from the open set to the closed set
      this.openDataMap.delete(node.data.hash)
      this.closedDataSet.add(node.data.hash)
      this.visitedChunks.add(`${node.data.x >> 4},${node.data.z >> 4}`)

      // Get all valid neighboring nodes
      const neighbors = this.movements.getNeighbors(node.data)
      for (const neighborData of neighbors) {
        // Skip neighbors that are already in the closed set
        if (this.closedDataSet.has(neighborData.hash)) {
          continue
        }

        // Calculate the cost from the start node to this neighbor
        const gFromThisNode = node.g + neighborData.cost
        let neighborNode = this.openDataMap.get(neighborData.hash)
        let update = false

        // Calculate the heuristic cost to the goal
        const heuristic = this.goal.heuristic(neighborData)
        if (this.maxCost > 0 && gFromThisNode + heuristic > this.maxCost) continue

        // If the neighbor is not in the open set, add it
        if (neighborNode === undefined) {
          neighborNode = new PathNode()
          this.openDataMap.set(neighborData.hash, neighborNode)
        } else {
          // If the neighbor is already in the open set with a lower cost, skip it
          if (neighborNode.g < gFromThisNode) {
            continue
          }
          update = true
        }

        // Update the neighbor with the new cost and parent node
        neighborNode.set(neighborData, gFromThisNode, heuristic, node)
        if (neighborNode.h < this.bestNode.h) this.bestNode = neighborNode

        // Update the open heap with the new or updated neighbor node
        if (update) {
          this.openHeap.update(neighborNode)
        } else {
          this.openHeap.push(neighborNode)
        }
      }
    }

    // If all nodes have been processed and no path was found
    return this.makeResult('noPath', this.bestNode)
  }
}

module.exports = AStar