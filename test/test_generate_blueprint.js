
/**
 *
 * @param m - length (x-axis)
 * @param n - width (y-axis)
 * @param p - depth (z-axis, how many layers)
 * @param rooms
 * @returns {any[][][]}
 */
function generateAbstractRooms(m, n, p, rooms = 5) {
    const matrix = Array.from({ length: p }, () =>
        Array.from({ length: m }, () =>
            Array(n).fill('air')
        )
    );

    // Mark entire outer border with 'stone'
    for (let z = 0; z < p; z++) {
        for (let x = 0; x < m; x++) {
            for (let y = 0; y < n; y++) {
                if (
                    z === 0 || z === p - 1 || // Top and bottom faces
                    x === 0 || x === m - 1 || // Front and back faces
                    y === 0 || y === n - 1    // Left and right faces
                ) {
                    matrix[z][x][y] = 'stone';
                }
            }
        }
    }

    const usedSpaces = new Set();

    // Loop that places rooms
    for (let roomCount = 0; roomCount < rooms; roomCount++) {
        const length = Math.max(4, Math.floor(Math.random() * 6) + 4);
        const width = Math.max(4, Math.floor(Math.random() * 6) + 4);
        const depth = Math.max(3, Math.floor(Math.random() * 6) + 4);

        let roomPlaced = false;

        for (let attempt = 0; attempt < 50; attempt++) {
            const x = Math.floor(Math.random() * (m - length - 1)) + 1;
            const y = Math.floor(Math.random() * (n - width - 1)) + 1;
            const z = Math.floor(Math.random() * (p - depth - 1)) + 1;

            // Check space availability, excluding room's own edges (so that walls/ceilings can be shared)
            console.log(`Attempting room: ${length}x${width}x${depth}`);

            const spaceAvailable = !Array.from({ length: depth }).some((_, di) =>
                Array.from({ length: length }).some((_, dj) =>
                    Array.from({ length: width }).some((_, dk) =>
                        // Exclude room's own edges from check
                        (di !== 0 && di !== depth - 1 &&
                            dj !== 0 && dj !== length - 1 &&
                            dk !== 0 && dk !== width - 1) &&
                        usedSpaces.has(`${x + dj},${y + dk},${z + di}`)
                    )
                )
            );

            if (spaceAvailable) {
                for (let di = 0; di < depth; di++) {
                    for (let dj = 0; dj < length; dj++) {
                        for (let dk = 0; dk < width; dk++) {
                            const spaceKey = `${x + dj},${y + dk},${z + di}`;
                            usedSpaces.add(spaceKey);

                            if (
                                z + di >= 0 && z + di < p &&
                                x + dj >= 0 && x + dj < m &&
                                y + dk >= 0 && y + dk < n
                            ) {
                                // Mark only the outer edges of the room
                                if (di === 0 || di === depth - 1 ||
                                    dj === 0 || dj === length - 1 ||
                                    dk === 0 || dk === width - 1) {
                                    matrix[z + di][x + dj][y + dk] = 'stone';
                                }
                            }
                        }
                    }
                }


                roomPlaced = true;
                break;
            }
        }

        if (!roomPlaced) {
            console.warn(`Could not place room ${roomCount}`);
        }
    }

    // TODO: Convert layers matrix into the right format

    return matrix;
}


/**
 * Systematically builds the houses by placing them next to the already existing rooms. Still uses randomness for what gets placed next.
 * @param m width of the 3D space
 * @param n height of the 3D space
 * @param p depth of the 3D space
 * @param rooms Number of rooms to attempt to generate
 */
// todo: add room size params, room material params, roof style
function generateSequentialRooms(m=20, n=20, p=20, rooms=8) {
    // Build 3D space
    const matrix = Array.from({length: p}, () =>
        Array.from({length: m}, () =>
            Array(n).fill('air')
        )
    );

    // Mark entire outer border with 'stone'
    for (let z = 0; z < p; z++) {
        for (let x = 0; x < m; x++) {
            for (let y = 0; y < n; y++) {
                if (
                    z === 0 || z === p - 1 || // Top and bottom faces
                    x === 0 || x === m - 1 || // Front and back faces
                    y === 0 || y === n - 1    // Left and right faces
                ) {
                    matrix[z][x][y] = 'stone';
                }
            }
        }
    }

    let placedRooms = 0;
    let lastRoom = null;

    // Direction probabilities (e.g., 'above': 40%, 'left': 15%, etc.)
    const directionChances = [
        {direction: 'above', chance: 0.15},
        {direction: 'left', chance: 0.15},
        {direction: 'right', chance: 0.15},
        {direction: 'forward', chance: 0.15},
        {direction: 'backward', chance: 0.15},
    ];

    // Function to pick a random direction based on percentages
    function getRandomDirection() {
        const rand = Math.random();
        let cumulative = 0;

        for (const {direction, chance} of directionChances) {
            cumulative += chance;
            if (rand <= cumulative) return direction;
        }
        return directionChances[1].direction; // Fallback to the first direction
    }

    // Ensures no rooms overlap except at edges
    // Ensures no rooms overlap except at edges
    function isSpaceValid(newX, newY, newZ, newLength, newWidth, newDepth) {
        for (let di = 0; di < newDepth; di++) {
            for (let dj = 0; dj < newLength; dj++) {
                for (let dk = 0; dk < newWidth; dk++) {
                    const x = newX + dj;
                    const y = newY + dk;
                    const z = newZ + di;

                    // Skip checking the outermost borders of the new room (these can overlap with stone)
                    if (dj === 0 || dj === newLength - 1 ||
                        dk === 0 || dk === newWidth - 1 ||
                        di === 0 || di === newDepth - 1) {
                        continue;
                    }

                    // For non-border spaces, ensure they're air
                    if (matrix[z][x][y] !== 'air') {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    function validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p) {
        // Allow rooms to use the matrix edges (note the <= instead of <)
        if (
            newX >= 0 && newX + newLength <= m &&
            newY >= 0 && newY + newWidth <= n &&
            newZ >= 0 && newZ + newDepth <= p &&
            isSpaceValid(newX, newY, newZ, newLength, newWidth, newDepth)
        ) {
            console.log(`Placing room at (${newX}, ${newY}, ${newZ}) with dimensions (${newLength}x${newWidth}x${newDepth})`);
            for (let di = 0; di < newDepth; di++) {
                for (let dj = 0; dj < newLength; dj++) {
                    for (let dk = 0; dk < newWidth; dk++) {
                        const x = newX + dj;
                        const y = newY + dk;
                        const z = newZ + di;

                        // If this is at a matrix border, don't modify it
                        if (x === 0 || x === m - 1 ||
                            y === 0 || y === n - 1 ||
                            z === 0 || z === p - 1) {
                            continue;
                        }

                        // For non-border spaces, check if this is a floor that should be shared
                        if (di === 0 && matrix[z-1][x][y] === 'stone') {
                            // Skip creating floor if there's a ceiling below
                            matrix[z][x][y] = 'air';
                        } else if (di === 0 || di === newDepth - 1 ||
                            dj === 0 || dj === newLength - 1 ||
                            dk === 0 || dk === newWidth - 1) {
                            matrix[z][x][y] = 'stone';
                        } else {
                            matrix[z][x][y] = 'air';
                        }


                    }
                }
            }
            return true;
        }
        return false;
    }

    function addDoor(matrix, x, y, z) {
        matrix[z][x][y] = 'stone';

        // Place the lower half of the door
        matrix[z + 1][x][y] = 'dark_oak_door[half=lower, hinge=left]';

        // Place the upper half of the door
        matrix[z + 2][x][y] = 'dark_oak_door[half=upper, hinge=left]';
    }


    function addStairs(matrix, x, y, z, direction) {
        let dz = 0; // Change in Z direction
        let dx = 0; // Change in X direction
        let facing = '';

        // Determine direction and facing
        switch (direction) {
            case 'north':
                dz = -1;
                facing = 'oak_stairs[facing=north]';
                break;
            case 'south':
                dz = 1;
                facing = 'oak_stairs[facing=south]';
                break;
            case 'east':
                dx = 1;
                facing = 'oak_stairs[facing=east]';
                break;
            case 'west':
                dx = -1;
                facing = 'oak_stairs[facing=west]';
                break;
            default:
                console.error('Invalid stair direction');
                return;
        }

        // Bore stair pattern downwards until we hit a floor or the matrix edge
        let currentZ = z;
        while (currentZ > 0 && matrix[currentZ - 1][x][y] === 'air') {
            // Place stone as foundation
            matrix[currentZ - 1][x][y] = 'stone';

            // Place stair above the stone
            matrix[currentZ][x][y] = facing;

            // Move down diagonally
            x += dx;
            y += dz;
            currentZ--;

            // Check if we've hit the edge
            if (x < 0 || x >= matrix[0].length || y < 0 || y >= matrix[0][0].length) break;
        }
    }

    function addLadder(matrix, x, y, z) {
        let currentZ = z+1;

        // turn the floor into air where person would go up
        matrix[currentZ][x+1][y] = 'air'

        // Build the first 3 ladder segments from floor level downwards
        for (let i = 0; i < 3; i++) {
            matrix[currentZ][x][y] = 'ladder[facing=north]';
            currentZ-=1
        }

        // Continue building ladder downwards until a floor is hit or we reach the bottom
        while (currentZ >= 0 && matrix[currentZ][x][y] === 'air') {
            // Place ladder
            matrix[currentZ][x][y] = 'ladder[facing=north]';

            // Move down
            currentZ--;
        }

    }


    // Places rooms until we can't, or we place all
    // attempts random configurations of rooms in random directions.
    while (placedRooms < rooms) {
        let roomPlaced = false;

        for (let attempt = 0; attempt < 150; attempt++) {
            const newLength = Math.max(6, Math.floor(Math.random() * 6) + 4);
            const newWidth = Math.max(6, Math.floor(Math.random() * 6) + 4);
            const newDepth = Math.max(5, Math.floor(Math.random() * 5) + 2);
            let newX, newY, newZ;

            // first room is special
            if (placedRooms === 0) {
                // First room placement
                newX = Math.floor(Math.random() * (m - newLength - 1)) + 1;
                newY = Math.floor(Math.random() * (n - newWidth - 1)) + 1;
                newZ = 0; // Ground floor

                if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p)) {
                    lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                    roomPlaced = true;
                    placedRooms++;

                    // Add doors to all four sides
                    // Left side
                    addDoor(matrix, newX, newY + Math.floor(newWidth / 2), newZ);
                    // Right side
                    addDoor(matrix, newX + newLength - 1, newY + Math.floor(newWidth / 2), newZ);
                    // Front side
                    addDoor(matrix, newX + Math.floor(newLength / 2), newY, newZ);
                    // Back side
                    addDoor(matrix, newX + Math.floor(newLength / 2), newY + newWidth - 1, newZ);
                }

                break;
            }
            else {
                const direction = getRandomDirection();

                switch (direction) {
                    case 'above':
                        newX = lastRoom.x;
                        newY = lastRoom.y;
                        newZ = lastRoom.z + lastRoom.depth - 1;
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p)) {
                            // addStairs(matrix, lastRoom.x + Math.floor(lastRoom.length / 2),
                            //     lastRoom.y + Math.floor(lastRoom.width / 2),
                            //     lastRoom.z, 'north'); // Adjust direction based on layout
                            addLadder(matrix, lastRoom.x + Math.floor(lastRoom.length / 2),
                                lastRoom.y + Math.floor(lastRoom.width / 2),
                                newZ); // Adding the ladder
                            lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                            roomPlaced = true;
                            placedRooms++;
                            break;
                        }
                        break;

                    case 'left':
                        newX = lastRoom.x - newLength + 1;
                        newY = lastRoom.y;
                        newZ = lastRoom.z;
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p)) {
                            addDoor(matrix, lastRoom.x, lastRoom.y + Math.floor(lastRoom.width / 2), lastRoom.z);
                            lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                            roomPlaced = true;
                            placedRooms++;
                            break;
                        }
                        break;

                    case 'right':
                        newX = lastRoom.x + lastRoom.length - 1;
                        newY = lastRoom.y;
                        newZ = lastRoom.z;
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p)) {
                            addDoor(matrix, lastRoom.x + lastRoom.length - 1,
                                lastRoom.y + Math.floor(lastRoom.width / 2),
                                lastRoom.z);
                            lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                            roomPlaced = true;
                            placedRooms++;
                            break;
                        }
                        break;

                    case 'forward':
                        newX = lastRoom.x;
                        newY = lastRoom.y + lastRoom.width - 1;
                        newZ = lastRoom.z;
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p)) {
                            addDoor(matrix, lastRoom.x + Math.floor(lastRoom.length / 2),
                                lastRoom.y + lastRoom.width - 1,
                                lastRoom.z);
                            lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                            roomPlaced = true;
                            placedRooms++;
                            break;
                        }
                        break;

                    case 'backward':
                        newX = lastRoom.x;
                        newY = lastRoom.y - newWidth + 1;
                        newZ = lastRoom.z;
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p)) {
                            addDoor(matrix, lastRoom.x + Math.floor(lastRoom.length / 2),
                                lastRoom.y,
                                lastRoom.z);
                            lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                            roomPlaced = true;
                            placedRooms++;
                            break;
                        }
                        break;
                }

                if (roomPlaced) {
                    break;
                }
            }
        }

        if (!roomPlaced) {
            console.warn(`Could not place room ${placedRooms + 1}`);
            break;
        }
    }



    // Replace outer stone layer with glass
    for (let z = 0; z < p; z++) {
        for (let x = 0; x < m; x++) {
            for (let y = 0; y < n; y++) {
                if (
                    (z === 0 || z === p - 1 || // Top and bottom faces
                        x === 0 || x === m - 1 || // Front and back faces
                        y === 0 || y === n - 1) && // Left and right faces
                    matrix[z][x][y] === 'stone' // Only replace if it's stone
                ) {
                    matrix[z][x][y] = 'glass';
                }
            }
        }
    }

    return matrix
}



/**
 * Converts a 3D matrix into a Minecraft blueprint format
 * @param {Array<Array<Array<string>>>} matrix - 3D matrix of block types
 * @param {number[]} startCoord - Starting coordinates [x, y, z]
 * @returns {Object} Blueprint object in Minecraft format
 */
function matrixToBlueprint(matrix, startCoord) {
    // Validate inputs
    if (!Array.isArray(matrix) || !Array.isArray(startCoord) || startCoord.length !== 3) {
        throw new Error('Invalid input format');
    }

    const [startX, startY, startZ] = startCoord;

    return {
        levels: matrix.map((level, levelIndex) => ({
            level: levelIndex,
            coordinates: [
                startX,
                startY + levelIndex,
                startZ
            ],
            placement: level.map(row =>
                // Ensure each block is a string, default to 'air' if undefined
                row.map(block => block?.toString() || 'air')
            )
        }))
    };
}



/**
 * for cutesy output
 * @param matrix
 */
function printMatrix(matrix) {
    matrix.forEach((layer, layerIndex) => {
        console.log(`Layer ${layerIndex}:`);
        layer.forEach(row => {
            console.log(
                row.map(cell => {
                    switch (cell) {
                        case 'stone': return '█';  // Wall
                        case 'air': return '.';    // Open space
                        case 'dark_oak_door[half=upper, hinge=left]': return 'D';
                        case 'dark_oak_door[half=lower, hinge=left]': return 'D';
                        case 'oak_stairs[facing=north]': return 'S';  // Stairs
                        case 'oak_stairs[facing=east]': return 'S';  // Stairs
                        case 'oak_stairs[facing=south]': return 'S';  // Stairs
                        case 'oak_stairs[facing=west]': return 'S';  // Stairs
                        case 'glass': return 'W'


                        default: return '?';       // Unknown or unmarked space
                    }
                }).join(' ')
            );
        });
        console.log('---');
    });
}



// main:
const resultMatrix = generateSequentialRooms(20, 10, 20, 10);
printMatrix(resultMatrix)
const glass_matrix = resultMatrix.map((layer) => {
    return layer.map((row) => {
        return row.map((cell) => {
            if (cell === 'stone') {
                return 'purple_stained_glass';
            }
            return cell;
        })
    })
});
console.log(glass_matrix)
let blueprint = matrixToBlueprint(glass_matrix,[194, -60, -94])
console.log(blueprint)


import mineflayer from "mineflayer";
import {autoBuild} from "./test_blueprint_layout.js";

const bot = mineflayer.createBot({
    host: 'localhost', // Replace with your server IP or hostname
    port: 55916,       // Replace with your server port
    username: 'andy', // Replace with your bot's username
    // password: 'your_bot_password' // Only if the server has online-mode=true
});

bot.on('spawn', async () => {
    // have andy build the blueprint automatically
    const result = autoBuild(blueprint);
    // const result = clearHouse(blueprint)
    const commands = result.commands;
    const nearbyPosition = result.nearbyPosition;
    for (const command of commands) {
        bot.chat(command);
    }

    // console.log(commands.slice(-10));
    bot.chat('I have built the house!');
    bot.chat('/tp @a ' + nearbyPosition.x + ' ' + nearbyPosition.y + ' ' + nearbyPosition.z+1);

    // Print out the location nearby the blueprint
    console.log(`tp ${nearbyPosition.x} ${nearbyPosition.y} ${nearbyPosition.z}`)

});

