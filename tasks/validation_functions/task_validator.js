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
        //todo: check that this code actually works by creating a sandbox environment
        // validate that bot has the item
        try{
            this.bot.inventory.slots.forEach((slot) => {
                console.log(slot);
                console.log(this.target);
                if (slot && slot.name.toLowerCase() === this.target && slot.count >= this.number_of_target) {
                    return true;
                }
            });
        } catch (error) {
            console.error('Error validating task:', error);
            return false;
        }
        
        return false;
    }
}