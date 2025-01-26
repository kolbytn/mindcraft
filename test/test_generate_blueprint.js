
/** Main big funciton: Builds the foundation of the house. breaks down into smaller functions like generating the rooms, generating embellishments, etc...
 *
 * @param position coordinate that specify where the house should be built. come in as [x,y,z]
 * @param windows an int that can be 0,1,2 for increasing frequencies of windows
 * @param doors a boolean that has doors for room or no doors (if ur crazy ig)
 */
function buildHouse(position, windows, doors){
    // randomly initalize a space for a 3D matrix (make sure its big enough)
    const minSize = 30; // Minimum size for width, length, height
    const randomness = 20; // Maximum randomness to add
    const width = Math.floor(Math.random() * (randomness + 1)) + minSize;
    const length = Math.floor(Math.random() * (randomness + 1)) + minSize;
    const height = Math.floor(Math.random() * (randomness + 1)) + minSize;


    // slice up the space ensuring each compartment has at least 4x4x2 space.
    const resultMatrix = generateAbstractRooms(width, length, height, 3);
    printMatrix(resultMatrix)


    // todo: then, internally do things like windows / stairs / doors/ etc...
}


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
 * Systematically builds the houses by placing them next to the already existing rooms. Still uses randomness.
 * @param m Width of the 3D space
 * @param n Height of the 3D space
 * @param p Depth of the 3D space
 * @param rooms Number of rooms to generate
 */
function generateSequentialRooms(m, n, p, rooms) {
    // build 3d space
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
    let placedRooms = 0;
    let lastRoom = null;

    const placementDirections = ['above', 'left', 'right', 'forward', 'backward'];

    while (placedRooms < rooms) {
        const newLength = Math.max(4, Math.floor(Math.random() * 6) + 4);
        const newWidth = Math.max(4, Math.floor(Math.random() * 6) + 4);
        const newDepth = Math.max(3, Math.floor(Math.random() * 6) + 4);

        let roomPlaced = false;

        for (let attempt = 0; attempt < 150; attempt++) {
            let newX, newY, newZ;

            if (placedRooms === 0) {
                newX = Math.floor(Math.random() * (m - newLength - 1)) + 1;
                newY = Math.floor(Math.random() * (n - newWidth - 1)) + 1;
                newZ = 1; // Ground floor
            } else {
                const direction = placementDirections[Math.floor(Math.random() * placementDirections.length)];

                switch (direction) {
                    case 'above':
                        newX = lastRoom.x;
                        newY = lastRoom.y;
                        newZ = lastRoom.z + lastRoom.depth;
                        break;
                    case 'left':
                        newX = lastRoom.x - newLength;
                        newY = lastRoom.y;
                        newZ = lastRoom.z;
                        break;
                    case 'right':
                        newX = lastRoom.x + lastRoom.length;
                        newY = lastRoom.y;
                        newZ = lastRoom.z;
                        break;
                    case 'forward':
                        newX = lastRoom.x;
                        newY = lastRoom.y + lastRoom.width;
                        newZ = lastRoom.z;
                        break;
                    case 'backward':
                        newX = lastRoom.x;
                        newY = lastRoom.y - newWidth;
                        newZ = lastRoom.z;
                        break;
                }
            }

            if (newX > 0 && newX + newLength < m &&
                newY > 0 && newY + newWidth < n &&
                newZ > 0 && newZ + newDepth < p) {

                // Check space availability
                const spaceAvailable = !Array.from({ length: newDepth }).some((_, di) =>
                    Array.from({ length: newLength }).some((_, dj) =>
                        Array.from({ length: newWidth }).some((_, dk) =>
                            usedSpaces.has(`${newX + dj},${newY + dk},${newZ + di}`)
                        )
                    )
                );

                if (spaceAvailable) {
                    // Place room and mark spaces
                    for (let di = 0; di < newDepth; di++) {
                        for (let dj = 0; dj < newLength; dj++) {
                            for (let dk = 0; dk < newWidth; dk++) {
                                const spaceKey = `${newX + dj},${newY + dk},${newZ + di}`;
                                usedSpaces.add(spaceKey);

                                // Mark only the outer edges of the room
                                if (di === 0 || di === newDepth - 1 ||
                                    dj === 0 || dj === newLength - 1 ||
                                    dk === 0 || dk === newWidth - 1) {
                                    matrix[newZ + di][newX + dj][newY + dk] = 'stone';
                                }
                            }
                        }
                    }

                    lastRoom = { x: newX, y: newY, z: newZ, length: newLength, width: newWidth, depth: newDepth };
                    placedRooms++;
                    roomPlaced = true;
                    break;
                }
            }
        }

        if (!roomPlaced) {
            console.warn(`Could not place room ${placedRooms + 1}`);
            break;
        }
    }

    console.log(`Placed rooms: ${placedRooms}`);
    return matrix;
}

// Helper function to place a room in the matrix
function placeRoom(matrix, x, y, z, length, width, depth) {
    for (let dx = x; dx < x + length; dx++) {
        for (let dy = y; dy < y + width; dy++) {
            for (let dz = z; dz < z + depth; dz++) {
                // Mark borders as stone
                if (dx === x || dx === x + length - 1 ||
                    dy === y || dy === y + width - 1 ||
                    dz === z || dz === z + depth - 1) {
                    matrix[dz][dx][dy] = 'stone';
                }
            }
        }
    }
}

// Check for room overlap (excluding border)
function roomOverlaps(matrix, x, y, z, length, width, depth) {
    for (let di = 1; di < depth - 1; di++) {
        for (let dj = 1; dj < length - 1; dj++) {
            for (let dk = 1; dk < width - 1; dk++) {
                // Check internal spaces for overlap
                if (matrix[z + di][x + dj][y + dk] === 'stone') {
                    return true;
                }
            }
        }
    }
    return false;
}

// Fisher-Yates shuffle to randomize placement directions
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}



/**
 * todo: Given a matrix, turn it into a blueprint
 */


function printMatrix(matrix) {
    matrix.forEach((layer, layerIndex) => {
        console.log(`Layer ${layerIndex}:`);
        layer.forEach(row => {
            console.log(
                row.map(cell => cell === 'stone' ? '█' : '.').join(' ')
            );
        });
        console.log('---');
    });
}

const resultMatrix = generateSequentialRooms(10, 20, 20, 6);
printMatrix(resultMatrix)


