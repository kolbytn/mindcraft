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


export async function sendRequest(turns, systemMessage, stop_seq='***') {

    let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

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
        res = 'My brain disconnected, try again.';
    }
    return res;
}
