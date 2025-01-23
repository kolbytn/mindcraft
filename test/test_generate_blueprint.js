
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


    // then, internally do things like windows / stairs / doors/ etc...
}



