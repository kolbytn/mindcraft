
import { readdirSync, readFileSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import settings from '../../settings.js';
import { addPluginActions } from './commands/index.js';

export class PluginManager {
    constructor(agent) {
        this.agent = agent;
        this.plugins = {};
    }

    init() {
        this.importPlugins()
            .then((plugins) => {
                this.plugins = plugins;
                for (let plugin in this.plugins) {
                    addPluginActions(plugin, this.plugins[plugin].getPluginActions());
                }
                console.log("Load plugins:", Object.keys(this.plugins).join(", "));
            })
            .catch((error) => {
                console.error("Error importing plugins:", error);
            });
    }

    async importPlugin(dir, name) {
        let path = join(dir, name, "main.js");
        let instance = null;
        try {
            const plugin = await import(pathToFileURL(path).href);
            if (plugin.PluginInstance) {
                instance = new plugin.PluginInstance(this.agent);
                instance.init();
            } else {
                console.error(`Can't find PluginInstance in ${path}.`);
            }
        } catch (error) {
            console.error(`Error import plugin ${path}:`, error);
        }
        return instance;
    }

    async importPlugins(dir = "src/plugins") {
        let plugins = {};
        try {
            for (let file of readdirSync(dir, { withFileTypes: true })) {
                if (settings.plugins && settings.plugins.includes(file.name) && file.isDirectory && !file.name.startsWith('.')) {
                    let instance = await this.importPlugin(dir, file.name);
                    plugins[file.name] = instance;
                }
            }
        } catch (error) {
            console.error(`Error importing plugins in ${dir}:`, error);
        }
        return plugins;
    }
}