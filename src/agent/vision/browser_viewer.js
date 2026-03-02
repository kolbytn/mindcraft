import settings from '../settings.js';

export function addBrowserViewer(bot, count_id) {
    if (settings.render_bot_view) {
        import('prismarine-viewer').then(({ default: prismarineViewer }) => {
            const mineflayerViewer = prismarineViewer.mineflayer;
            mineflayerViewer(bot, { host: '0.0.0.0', port: 3000+count_id, firstPerson: true });
        }).catch((err) => {
            console.warn(`[BrowserViewer] Failed to load prismarine-viewer: ${err.message}`);
            console.warn('[BrowserViewer] render_bot_view disabled — canvas native module not available.');
        });
    }
}