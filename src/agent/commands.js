
import { actionsList } from './commands/actions.js';
import { queryList } from './commands/queries.js';

const commandList = queryList.concat(actionsList);
const commandMap = {};
for (let command of commandList) {
    commandMap[command.name] = command;
}

export function getCommand(name) {
    return commandMap[name];
}

export function containsCommand(message) {
    for (let command of commandList) {
        if (message.includes(command.name)) {
            return command.name;
        }
    }
    return null;
}

export function getCommandDocs() {
    let docs = `\n*Command DOCS\n You can use the following commands to perform actions and get information about the world. 
    Use the commands with the syntax: !commandName \n
    Don't use codeblocks. Only use one command in each response, trailing commands will be ignored. Use these commands frequently in your responses!\n`;
    for (let command of commandList) {
        docs += command.name + ': ' + command.description + '\n';
    }
    return docs + '*\n';
}