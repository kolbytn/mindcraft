import OpenAIApi from 'openai';


let openAiConfig = null;
if (process.env.OPENAI_ORG_ID) {
    openAiConfig = {
        organization: process.env.OPENAI_ORG_ID,
        apiKey: process.env.OPENAI_API_KEY,
    };
} else {
    openAiConfig = {
        apiKey: process.env.OPENAI_API_KEY,
    };
}
const openai = new OpenAIApi(openAiConfig);


export async function sendRequest(turns, systemMessage, stop_seq) {

    let messages = [{'role': 'system', 'content': systemMessage}];
    for (let i = 0; i < turns.length; i++) {
        if (i % 2 == 0) {
            messages.push({'role': 'user', 'content': turns[i]});
        } else {
            messages.push({'role': 'assistant', 'content': turns[i]});
        }
    }

    let res = null;
    try {
        let completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: messages,
            stop: stop_seq,
        });
        res = completion.choices[0].message.content;
    }
    catch (err) {
        console.log(err);
        res = 'I am sorry, I do not know how to respond to that.';
    }
    return res;
}
