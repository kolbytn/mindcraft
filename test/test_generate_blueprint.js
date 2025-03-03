import {materials} from "mineflayer-armor-manager/dist/data/armor.js";

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

    blueprint = matrixToBlueprint(matrix, [200, -60, -100])

    return blueprint;
}


/**
 * Systematically builds the houses by placing them next to the already existing rooms. Still uses randomness for what gets placed next.
 * @param m width of the 3D space
 * @param n height of the 3D space
 * @param p depth of the 3D space
 * @param rooms Number of rooms to attempt to generate
 * @param minRoomWidth
 * @param minRoomLength
 * @param minRoomDepth
 * @param roomVariance How much the room size will vary
 * @param wrapping material of wrapping (air, glass, etc...) -> default is air
 * @param carpetStyle 0,1,2 increasingly more complex
 * @param windowStyle 0,1,2 increasingly more complex
 * @param complexity 0,1,2,3,4 for increasingly complex materials for room generation
 * @returns a Blueprint object
 */
// todo: room material params, roof style
function proceduralGeneration(m = 20,
                                 n = 20,
                                 p = 20,
                                 rooms = 8,
                                 minRoomWidth = 5,
                                 minRoomLength = 5,
                                 minRoomDepth = 6,
                                 roomVariance = 5,
                                 wrapping = "air",
                                 carpetStyle = 1,
                                 windowStyle = 2,
                                 complexity = 4) {
    // Build 3D space
    const matrix = Array.from({length: p}, () =>
        Array.from({length: m}, () =>
            Array(n).fill('air')
        )
    );

    // set materials
    let roomMaterials = ["stone", "terracotta", "quartz_block", "copper_block", "purpur_block"]

    if (complexity < roomMaterials.length){
        roomMaterials = roomMaterials.slice(0, complexity + 1);
    }

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

    // Replace outer layer with wrap
    for (let z = 0; z < p; z++) {
        for (let x = 0; x < m; x++) {
            for (let y = 0; y < n; y++) {
                if (
                    (z === p - 1 || // Top face
                        x === 0 || x === m - 1 || // Front and back faces
                        y === 0 || y === n - 1) // Left and right faces
                ) {
                    matrix[z][x][y] = wrapping;
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

    function validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p, material) {
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
                        if (z === 0){
                            continue;
                        }
                        // if (x === 0 || x === m - 1 ||
                        //     y === 0 || y === n - 1 ||
                        //     z === 0 || z === p - 1) {
                        //     continue;
                        // }

                        // For non-border spaces, check if this is a floor that should be shared
                        //was: === 'stone'
                        if (di === 0 && matrix[z-1][x][y] !== 'air') {
                            // Skip creating floor if there's a ceiling below
                            matrix[z][x][y] = 'air';
                        } else if (di === 0 || di === newDepth - 1 ||
                            dj === 0 || dj === newLength - 1 ||
                            dk === 0 || dk === newWidth - 1) {
                            matrix[z][x][y] = material;
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

    function addDoor(matrix, x, y, z, material) {
        matrix[z][x][y] = material;

        // Place the lower half of the door
        matrix[z + 1][x][y] = 'dark_oak_door[half=lower, hinge=left]';

        // Place the upper half of the door
        matrix[z + 2][x][y] = 'dark_oak_door[half=upper, hinge=left]';
    }


    // Takes in a room and randomly converts some faces to be windows
    function addWindowsAsSquares(matrix, x, y, z, newLength, newWidth, newDepth, material) {
        // Matrix dimensions
        const matrixDepth = matrix.length;
        const matrixLength = matrix[0].length;
        const matrixWidth = matrix[0][0].length;
        const windowX = Math.ceil(minRoomWidth/2)
        const windowY = Math.ceil(minRoomLength/2)
        const windowZ = Math.ceil(minRoomDepth/2)

        // Helper function to check if coordinates are within bounds
        function isInBounds(z, x, y) {
            return z >= 0 && z < matrixDepth &&
                x >= 0 && x < matrixLength &&
                y >= 0 && y < matrixWidth;
        }

        // Front and back faces (z is constant)
        if (Math.random() < 0.8) {
            let centerX = x + Math.floor(newLength / 2 - windowX/2);
            let centerY = y + Math.floor(newWidth / 2 - windowY/2);

            for (let dx = 0; dx <= windowX; dx++) {
                for (let dy = 0; dy <= windowY; dy++) {
                    let frontZ = z;
                    let backZ = z + newDepth - 1;

                    if (isInBounds(frontZ, centerX + dx, centerY + dy) &&
                        matrix[frontZ][centerX + dx][centerY + dy] === material) {
                        matrix[frontZ][centerX + dx][centerY + dy] = 'glass';
                    }
                    if (isInBounds(backZ, centerX + dx, centerY + dy) &&
                        matrix[backZ][centerX + dx][centerY + dy] === material) {
                        matrix[backZ][centerX + dx][centerY + dy] = 'glass';
                    }
                }
            }
        }

        // Left and right faces (x is constant)
        if (Math.random() < 0.8) {
            let centerZ = z + Math.floor(newDepth / 2 - windowZ/2);
            let centerY = y + Math.floor(newWidth / 2 - windowY/2);

            for (let dz = 0; dz <= windowZ; dz++) {
                for (let dy = 0; dy <= windowY; dy++) {
                    let leftX = x;
                    let rightX = x + newLength - 1;

                    if (isInBounds(centerZ + dz, leftX, centerY + dy) &&
                        matrix[centerZ + dz][leftX][centerY + dy] === material) {
                        matrix[centerZ + dz][leftX][centerY + dy] = 'glass';
                    }
                    if (isInBounds(centerZ + dz, rightX, centerY + dy) &&
                        matrix[centerZ + dz][rightX][centerY + dy] === material) {
                        matrix[centerZ + dz][rightX][centerY + dy] = 'glass';
                    }
                }
            }
        }

        // Top and bottom faces (y is constant)
        if (Math.random() < 0.8) {
            let centerX = x + Math.floor(newLength / 2 - windowX/2);
            let centerZ = z + Math.floor(newDepth / 2 - windowZ / 2);

            for (let dx = 0; dx <= windowX; dx++) {
                for (let dz = 0; dz <= windowZ; dz++) {
                    let bottomY = y;
                    let topY = y + newWidth - 1;

                    if (isInBounds(centerZ + dz, centerX + dx, bottomY) &&
                        matrix[centerZ + dz][centerX + dx][bottomY] === material) {
                        matrix[centerZ + dz][centerX + dx][bottomY] = 'glass';
                    }
                    if (isInBounds(centerZ + dz, centerX + dx, topY) &&
                        matrix[centerZ + dz][centerX + dx][topY] === material) {
                        matrix[centerZ + dz][centerX + dx][topY] = 'glass';
                    }
                }
            }
        }
    }

    function addWindowsAsPlane(matrix, x, y, z, newLength, newWidth, newDepth, material) {
        // Ensure the new dimensions are within bounds
        const maxX = matrix[0].length;
        const maxY = matrix[0][0].length;
        const maxZ = matrix.length;

        // Each face has a 30% chance of becoming a window
        if (Math.random() < 0.8) {
            for (let dx = 0; dx < newLength; dx++) {
                for (let dy = 0; dy < newWidth; dy++) {
                    let frontZ = z;
                    let backZ = z + newDepth - 1;

                    // Check bounds before modifying the matrix
                    if (frontZ >= 0 && frontZ < maxZ && x + dx >= 0 && x + dx < maxX && y + dy >= 0 && y + dy < maxY) {
                        if (matrix[frontZ][x + dx][y + dy] === material) {
                            matrix[frontZ][x + dx][y + dy] = 'glass';
                        }
                    }
                    if (backZ >= 0 && backZ < maxZ && x + dx >= 0 && x + dx < maxX && y + dy >= 0 && y + dy < maxY) {
                        if (matrix[backZ][x + dx][y + dy] === material) {
                            matrix[backZ][x + dx][y + dy] = 'glass';
                        }
                    }
                }
            }
        }

        if (Math.random() < 0.8) {
            for (let dz = 0; dz < newDepth; dz++) {
                for (let dy = 0; dy < newWidth; dy++) {
                    let leftX = x;
                    let rightX = x + newLength - 1;

                    // Check bounds before modifying the matrix
                    if (leftX >= 0 && leftX < maxX && z + dz >= 0 && z + dz < maxZ && y + dy >= 0 && y + dy < maxY) {
                        if (matrix[z + dz][leftX][y + dy] === material) {
                            matrix[z + dz][leftX][y + dy] = 'glass';
                        }
                    }
                    if (rightX >= 0 && rightX < maxX && z + dz >= 0 && z + dz < maxZ && y + dy >= 0 && y + dy < maxY) {
                        if (matrix[z + dz][rightX][y + dy] === material) {
                            matrix[z + dz][rightX][y + dy] = 'glass';
                        }
                    }
                }
            }
        }
    }


    // out of commission
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

    function addCarpet(probability, matrix, newX, newY, newZ, newLength, newWidth, material) {
        let colors = ["blue", "cyan", "light_blue", "lime"];

        // Iterate through the dimensions of the room
        for (let dx = 1; dx < newLength-1; dx++) {
            for (let dy = 1; dy < newWidth-1; dy++) {
                let x = newX + dx;
                let y = newY + dy;
                let z = newZ; // Start at floor level

                // Check if there is floor (not air)
                if (matrix[z][x][y] === material) {
                    // Consider a random probability of adding a carpet
                    if (Math.random() < probability) {
                        // Choose a random color for the carpet
                        let randomColor = colors[Math.floor(Math.random() * colors.length)];
                        // Add carpet one z position above the floor with a random color
                        matrix[z + 1][x][y] = `${randomColor}_carpet`;
                    }
                }
            }
        }
    }

    function addLadder(matrix, x, y, z) {
        let currentZ = z+1;

        // turn the floor into air where person would go up
        matrix[currentZ][x+1][y] = 'air';

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


    function embellishments(carpet, windowStyle, matrix, newX, newY, newZ, newLength, newWidth, newDepth, material){


        switch (windowStyle) {
            case 0:
                break;
            case 1:
                addWindowsAsSquares(matrix, newZ, newY, newZ, newLength, newWidth, newDepth, material)
                break;
            case 2:
                addWindowsAsPlane(matrix, newZ, newY, newZ, newLength, newWidth, newDepth, material)
        }


        switch (carpet) {
            case 0:
                break;
            case 1:
                addCarpet(0.3,matrix,newX, newY, newZ, newLength, newWidth, material);
                break;
            case 2:
                addCarpet(0.7,matrix,newX, newY, newZ, newLength, newWidth, material)
                break;
        }


    }


    // Places rooms until we can't, or we place all
    // attempts random configurations of rooms in random directions.
    while (placedRooms < rooms) {
        let roomPlaced = false;

        for (let attempt = 0; attempt < 150; attempt++) {

            const material = roomMaterials[Math.floor(Math.random() * roomMaterials.length)];


            // dimensions of room
            const newLength = Math.max(minRoomLength, Math.floor(Math.random() * roomVariance) + minRoomLength);
            const newWidth = Math.max(minRoomWidth, Math.floor(Math.random() * roomVariance) + minRoomWidth);
            const newDepth = Math.max(minRoomDepth, Math.floor(Math.random() * Math.floor(roomVariance/2) ) + minRoomDepth );
            let newX, newY, newZ;

            // first room is special
            if (placedRooms === 0) {
                // First room placement
                newX = Math.floor(Math.random() * (m - newLength - 1)) + 1;
                newY = Math.floor(Math.random() * (n - newWidth - 1)) + 1;
                newZ = 0; // Ground floor

                if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p, material)) {
                    lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                    roomPlaced = true;
                    placedRooms++;

                    // Add doors to all four sides
                    // Left side
                    addDoor(matrix, newX, newY + Math.floor(newWidth / 2), newZ, material);
                    // Right side
                    addDoor(matrix, newX + newLength - 1, newY + Math.floor(newWidth / 2), newZ, material);
                    // Front side
                    addDoor(matrix, newX + Math.floor(newLength / 2), newY, newZ, material);
                    // Back side
                    addDoor(matrix, newX + Math.floor(newLength / 2), newY + newWidth - 1, newZ, material);

                    addCarpet(0.7, matrix, newX, newY, newZ, newLength, newWidth)
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
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p, material)) {

                            embellishments(carpetStyle, windowStyle, matrix, newX, newY, newZ, newLength, newWidth, newDepth, material)

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
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p, material)) {


                            embellishments(carpetStyle, windowStyle, matrix, newX, newY, newZ, newLength, newWidth, newDepth, material)


                            addDoor(matrix, lastRoom.x, lastRoom.y + Math.floor(lastRoom.width / 2), lastRoom.z, material);




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
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p, material)) {

                            embellishments(carpetStyle, windowStyle, matrix, newX, newY, newZ, newLength, newWidth, newDepth, material)


                            addDoor(matrix, lastRoom.x + lastRoom.length - 1,
                                lastRoom.y + Math.floor(lastRoom.width / 2),
                                lastRoom.z, material);




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
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p, material)) {

                            embellishments(carpetStyle, windowStyle, matrix, newX, newY, newZ, newLength, newWidth, newDepth, material)


                            addDoor(matrix, lastRoom.x + Math.floor(lastRoom.length / 2),
                                lastRoom.y + lastRoom.width - 1,
                                lastRoom.z, material);




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
                        if (validateAndBuildBorder(matrix, newX, newY, newZ, newLength, newWidth, newDepth, m, n, p, material)) {

                            embellishments(carpetStyle, windowStyle, matrix, newX, newY, newZ, newLength, newWidth, newDepth, material)


                            addDoor(matrix, lastRoom.x + Math.floor(lastRoom.length / 2),
                                lastRoom.y,
                                lastRoom.z, material);



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
const resultMatrix = proceduralGeneration(20, 10, 20, 10, "air", 2, 2, 4);
printMatrix(resultMatrix)

let blueprint = matrixToBlueprint(resultMatrix,[122, -60, -178])

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

    console.log(commands.slice(-10));
    bot.chat('I have built the house!');
    // bot.chat('/tp @a ' + nearbyPosition.x + ' ' + nearbyPosition.y + ' ' + nearbyPosition.z+1);

    // Print out the location nearby the blueprint
    console.log(`tp ${nearbyPosition.x} ${nearbyPosition.y} ${nearbyPosition.z}`)
});

