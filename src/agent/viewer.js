import settings from '../../settings.js';
import prismarineViewer from 'prismarine-viewer';
const mineflayerViewer = prismarineViewer.mineflayer;

export function addViewer(bot, count_id) {
    if (settings.show_bot_views)
        mineflayerViewer(bot, { port: 3000+count_id, firstPerson: true, });
}