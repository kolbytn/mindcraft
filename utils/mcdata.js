import minecraftData from 'minecraft-data';
var mcdata = minecraftData("1.19.3");



export function getItemId(item) {
    return mcdata.itemsByName[item_type].id;
}