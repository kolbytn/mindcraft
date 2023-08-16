


var messages = [];


export function addEvent(source, message) {
    messages.push({source, message});
}


export function getHistory() {
    return messages;
}