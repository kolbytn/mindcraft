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

    async validate() {
        try{
            console.log("validate");
            let valid = false;
            await this.bot.inventory.slots.forEach((slot) => {
                // console.log(slot);
                // console.log(this.target);
                // // console.log(slot.count);
                // console.log(this.number_of_target);
                // console.log(slot && slot.name.toLowerCase() === this.target);
                // console.log(slot && slot.count >= this.number_of_target);
                // console.log(slot && slot.name.toLowerCase() === this.target && slot.count >= this.number_of_target);
                if (slot && slot.name.toLowerCase() === this.target && slot.count >= this.number_of_target) {
                    // console.log('returning true');
                    valid = true;
                    // console.log(valid);
                }
            });
            // console.log(valid);
            return valid;
        } catch (error) {
            console.error('Error validating task:', error);
            return false;
        }
    }
}