export function toSinglePrompt(turns, system=null, stop_seq='***', model_nickname='assistant') {
    let messages = turns;
    if (system) messages.unshift({role: 'system', content: system});
    let prompt = "";
    let role = "";
    messages.forEach((message) => {
        role = message.role;
        if (role === 'assistant') role = model_nickname;
        prompt += `${role}: ${message.content}${stop_seq}`;
    });
    if (role !== model_nickname) // if the last message was from the user/system, add a prompt for the model. otherwise, pretend we are extending the model's own message
        prompt += model_nickname + ": ";
    return prompt;
}
