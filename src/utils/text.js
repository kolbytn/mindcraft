export function stringifyTurns(turns) {
    let res = '';
    for (let turn of turns) {
        if (turn.role === 'assistant') {
            res += `\nYour output:\n${turn.content}`;
        } else if (turn.role === 'system') {
            res += `\nSystem output: ${turn.content}`;
        } else {
            res += `\nUser input: ${turn.content}`;
        
        }
    }
    return res.trim();
}

export function toSinglePrompt(turns, system=null, stop_seq='***', model_nickname='assistant') {
    let prompt = system ? `${system}${stop_seq}` : '';
    let role = '';
    turns.forEach((message) => {
        role = message.role;
        if (role === 'assistant') role = model_nickname;
        prompt += `${role}: ${message.content}${stop_seq}`;
    });
    if (role !== model_nickname) // if the last message was from the user/system, add a prompt for the model. otherwise, pretend we are extending the model's own message
        prompt += model_nickname + ": ";
    return prompt;
}

// ensures stricter turn order for anthropic/llama models
// combines repeated messages from the same role, separates repeat assistant messages with filler user messages
export function strictFormat(turns) {
    let prev_role = null;
    let messages = [];
    let filler = {role: 'user', content: '_'};
    for (let msg of turns) {
        msg.content = msg.content.trim();
        if (msg.role === 'system') {
            msg.role = 'user';
            msg.content = 'SYSTEM: ' + msg.content;
        }
        if (msg.role === prev_role && msg.role === 'assistant') {
            // insert empty user message to separate assistant messages
            messages.push(filler);
            messages.push(msg);
        }
        else if (msg.role === prev_role) {
            // combine new message with previous message instead of adding a new one
            messages[messages.length-1].content += '\n' + msg.content;
        }
        else {
            messages.push(msg);
        }
        prev_role = msg.role;
        
    }
    if (messages.length > 0 && messages[0].role !== 'user') {
        messages.unshift(filler); // anthropic requires user message to start
    }
    if (messages.length === 0) {
        messages.push(filler);
    }
    return messages;
}