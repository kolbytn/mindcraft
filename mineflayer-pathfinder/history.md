# History

# Leo ver.

# 2.4.5
* [Fix block update resets for optimized paths (@m000z0rz)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/330)
* [reword .stop() for more clarity (@Jovan-04)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/327)
* [add more detailed tutorial for mineflayer-pathfinder goals (@Jovan-04)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/326)
* [Fixed typo: "physicsTick" (@FreezeEngine)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/324)

# 2.4.4
* [Update readme.md (@Vinciepincie)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/320)
* Fix file linting (@IceTank)
* Fix possible reference error for block updates (@IceTank)
* [Fix a bunch of spelling/grammar errors (@182exe)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/316)

# 2.4.3
* [Change canOpenDoors default value to false because its buggy (@IceTank)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/318)
* [Added missing constructor definitions for GoalCompositeAny and GoalCompositeAll (@rutexd)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/315)
* [Added "sneak" on interact blocks to avoid open it (@sefirosweb)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/314)
* [Block face position fix (@WhoTho)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/312)
* [Remove mcData param in movements.js (@rtm516)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/311)

# 2.4.2
* Fix pathfinder trying to make a parkour jump that fails most times
* Fix pathfinder not going below level 0
* [Fix wheat not being break able (@maximmasiutin)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/303)
* [Add parameter typing to Composite goals (@Ic3Tank)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/302)
* [Fix GoalLookAtBlock documentation (@Ic3Tank)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/301)

# 2.4.1
* [Made some Goal methods none abstract (@IceTank)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/298)

# 2.4.0
* [mcData to registry refactoring (@Epirito)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/293)

# 2.3.3
* [Add missing types on GoalPlaceBlock and GoalLookAtBlock (@IceTank)](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/289)

# 2.3.2
* Revert broken goto implementation update.

# 2.3.1
* Fix reference error in `getNumEntitiesAt` (https://github.com/PrismarineJS/mineflayer-pathfinder/commit/2e7b3daff2ee5fa0aaf52db4553f769189b8d03f)

# 2.3.0
* [Add entity Avoidance Feature](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/281)
* [Fix bugs in movements.js](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/276)
* [Update Dependencies](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/277)
* [Fix issue with starting paths](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/280)

# 2.2.0
* [Add events typings](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/266)
* [Force look at blocks when breaking them](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/274)
* [Fix bot sometimes not triggering path end correctly](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/268)
* [Fix missing null check at block update](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/269)
* [Bump mocha to 10.x](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/265)

# 2.1.1
* Fix GitHub action for publishing

# 2.1.0
* [Add automated tests](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/262)
* [Add getPathFromTo function](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/255)
* [Fix path optimization check](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/254)
* [Bumb minecraft data to version 3.x](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/262)
* [Add goal chaining example](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/256)

# 2.0.0
* [Remove callbacks](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/248)
* [Export GoalLookAtBlock and deprecate GoalBreakBlock](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/249)

# 1.10.0

* [Add exclusion area mechanism](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/220)
* [Add movement class example](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/247)
* [Add infiniteLiquidDropdownDistance to movements](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/211)
* [Added dontMineUnderFallingBlock to movements](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/239/files)
* [Add ability to open fence gates](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/217)

* [Bump mineflayer to 4.0.0](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/245)
* [Throw error in goto when stop() is called](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/240)
* [Update README.md](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/246)

* Typing fixes:
  * [tickTimeout](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/241)
  * [GoalLookAtBlock](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/238)

* [Fix dynamic goals with entities](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/206)
* [Fix default scaffolding blocks](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/243)
* [Fix event handler when stop() is called](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/184)

# 1.9.1

* [Fixed unhandled promise rejection introduced in 1.0.0](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/235#event-5854609665)

# 1.9.0

* [Fixed floor check](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/208)
* [Avoid cobwebs](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/210)
* [Fixed diagonal move not considering collision height when jumping up diagonally](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/216)
* [Fixed movements for older versions](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/226)

# 1.8.0

* Fixed placeBlock example
* Fixed Readme typos
* Fixed bot placing wrong blocks as scaffolding
* Fixed GoalNearXZ
* Fixed typings
* Fixed index.d.ts compile errors

# 1.7.0

* Add GoalNearXZ
* Improve docs

# 1.6.3

* Add setGoal null to typings
* Add safeOrBreak check to getMoveDiagonal
* Fix reference to LOSWhenPlacingBlocks
* Fixed raycasting not considering block face
* Add GoalPlaceBlock typing
* Add placeBlock.js example
* Add callback.js and promise.js example
* Fix reference error in GoalPlaceBlock
* Function to stop path finding when safe

# 1.6.2

* Fix swimming in lava
* Fix TypeScript headers
* Add +1 to movement cost when going forward and up 1 block
* Fix bot trying to go underwater
* Add `path_reset` event

# 1.6.1

* Add option to limit search range
* Expose tickTimeout

# 1.6.0

* Add GoalPlaceBlock
* Fix various parkour moves
* Fix goto

# 1.5.0

* Improve diagonal movements (add up/down)
* Expose A* context in result
* Fix fences
* Fix carpets

# 1.4.0

* Legit bot bridging (with sneak)
* Fixed bug for detect when mining is stopped correctly
* Fix GoalGetToBlock

## 1.3.7

* Promisified goto

## 1.3.0

* Add ladder support
* Add ability to drop in water from high places
* Improve movement execution

## 1.2.0

* Use physics to predict motion and choose best controls
* Add more parkour moves
* Sprint and sprint-jump over gaps

## 1.1.2

* Set every non diggable block automatically from mcdata
* Fix jumps in snow

## 1.1.1

* Fix 1x1 towering
* Fix path starting on shorter blocks

## 1.1.0

* Fixed crash with null positions
* API in the readme
* Expose movements and goal

## 1.0.12

* Added `canDig` movements variable
* Added `goto(goal, cb)` function

## 1.0.11

* Added `goal_updated` event
* Movements are now initialized by default
* Fixed Typescript headers
* Fixed bugs with block height when jumping

## 1.0.10

* Fixed "cannot read property 'shapes' of null" bug
* Exposed `thinkTimeout` pathfinder variable

## 1.0.9

* Added simple postprocessing fallback for unsuitable positions

## 1.0.8

* Fixed null pointer exception for "getPositionOnTopOf"

## 1.0.7

* Improved post processing for standing on more block types
* Improved tool selection when breaking blocks
* Retrieve player state from Prismarine-Physics
* Fixed bug with parkour cooldown
* Added Typescript headers
* Fixed bug with clearing controls while recalculating path
* Removed path recalculation detection radius

## 1.0.6

* Added basic parkour movements
* Movement nodes are now stored as classes
* Astar algorithm is now stored as a class
* Improved blocks-to-break estimation in the path
* Fixed 12.x Node.js compatibility in example bot

## 1.0.5

* Added multiple bot example
* Added experimental "free-motion"
* Added composite goal
* Added `isMoving()` function
* Added `isMining()` function
* Added `isBuilding()` function
* Added `isThinking()` function

## 1.0.4

* Paths are now recalculated on chunk loading to fix long paths
* Minor bug fixes
* Moved scaffolding blocks from index.js to movements.js internally
* Updated readme todo list
* Added 1x1 tower creation

## 1.0.3

* Fixed `goal_reached` not being called if bot is already at the goal
* Control state is cleared when path is reset
* Fixed example bot code in readme
* Improved readme
* Fixed bug with place/dig logic
* Added swimming support

## 1.0.2

* Exposed goals and movements classes
* Fixed bugs with bot stopping incorrectly
* Improved readme
* Added performance benchmarks
* Added build CI support

## 1.0.1

* Added deployment CI support
* Added standard
* Fixed bug with not canceling digging when resetting path
* Fixed undefined pos error
* Added configurable fall height
* Added dynamic goals
* Added automatic path recalculation
* Added 1x1 digging holes
* Added more movement abilities
* Added internal scaffolding block count

## 1.0.0

* Initial release
