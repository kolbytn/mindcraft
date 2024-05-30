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