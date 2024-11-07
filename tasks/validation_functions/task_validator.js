import settings from '../../settings.js';
import minecraftData from 'minecraft-data';

const mc_version = settings.minecraft_version;
const mcData = minecraftData('1.16.5');

export class TechTreeHarvestValidator {
    constructor(task, bot) {
        this.target = task.target;
        this.number_of_target = task.number_of_target;
        this.bot = bot;
    }

    validate() {
        // validate that bot has the item
        bot.inventory.slots.forEach((slot) => {
            if (slot && slot.name === this.target && slot.count >= this.number_of_target) {
                return true;
            }
        });
        return false;
    }
}