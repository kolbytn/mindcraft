import minecraftData from 'minecraft-data';
var mcdata = minecraftData("1.19.3");


export function getItemId(item) {
    return mcdata.itemsByName[item_type].id;
}


export function getAllBlockIds(ignore) {
    let blocks = []
    for (let i = 0; i < mcdata.blocks.length; i++) {
        if (!ignore.includes(mcdata.blocks[i].name)) {
            blocks.push(mcdata.blocks[i].id);
        }
    }
    return blocks;
}

