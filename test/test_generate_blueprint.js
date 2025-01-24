
/** Build house
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
    const resultMatrix = generateMatrix(width, length, height, 3);
    console.log(resultMatrix)


    // then, internally do things like windows / stairs / doors/ etc...
}



//Todo: make robust. add stairs and windows and stuff
function generateMatrix(m, n, p, compartmentCount = 5) {
    const matrix = Array.from({ length: m }, () =>
        Array.from({ length: n }, () =>
            Array(p).fill('air')
        )
    );

    // Mark borders
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            matrix[i][j][0] = matrix[i][j][p-1] = 'stone';
            matrix[i][0][j] = matrix[i][n-1][j] = 'stone';
            matrix[0][i][j] = matrix[m-1][i][j] = 'stone';
        }
    }

    const usedSpaces = new Set();

    for (let _ = 0; _ < compartmentCount; _++) {
        const width = Math.floor(Math.random() * 6) + 3;
        const height = Math.floor(Math.random() * 6) + 3;
        const depth = Math.floor(Math.random() * 3) + 2;

        for (let attempt = 0; attempt < 50; attempt++) {
            const x = Math.floor(Math.random() * (m - height - 1)) + 1;
            const y = Math.floor(Math.random() * (n - width - 1)) + 1;
            const z = Math.floor(Math.random() * (p - depth - 1)) + 1;

            const spaceAvailable = !Array.from({ length: height }).some((_, di) =>
                Array.from({ length: width }).some((_, dj) =>
                    Array.from({ length: depth }).some((_, dk) =>
                        usedSpaces.has(`${x+di},${y+dj},${z+dk}`)
                    )
                )
            );

            if (spaceAvailable) {
                for (let di = 0; di < height; di++) {
                    for (let dj = 0; dj < width; dj++) {
                        matrix[x+di][y+dj][z] = 'stone';
                        matrix[x+di][y+dj][z+depth-1] = 'stone';
                        usedSpaces.add(`${x+di},${y+dj},${z}`);
                        usedSpaces.add(`${x+di},${y+dj},${z+depth-1}`);
                    }
                }
                for (let di = 0; di < height; di++) {
                    for (let dk = 0; dk < depth; dk++) {
                        matrix[x+di][y][z+dk] = 'stone';
                        matrix[x+di][y+width-1][z+dk] = 'stone';
                        usedSpaces.add(`${x+di},${y},${z+dk}`);
                        usedSpaces.add(`${x+di},${y+width-1},${z+dk}`);
                    }
                }
                for (let dj = 0; dj < width; dj++) {
                    for (let dk = 0; dk < depth; dk++) {
                        matrix[x][y+dj][z+dk] = 'stone';
                        matrix[x+height-1][y+dj][z+dk] = 'stone';
                        usedSpaces.add(`${x},${y+dj},${z+dk}`);
                        usedSpaces.add(`${x+height-1},${y+dj},${z+dk}`);
                    }
                }
                break;
            }
        }
    }

    return matrix;
}


function printMatrix(matrix) {
    matrix.forEach(row => {
        console.log(row.join(' ')); // Join elements of the row into a single string separated by spaces
    });
}

const resultMatrix = generateMatrix(10, 10, 10, 3);
printMatrix(resultMatrix)








/**
 * todo: Given a matrix, turn it into a blueprint
 */