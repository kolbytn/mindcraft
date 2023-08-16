import { Configuration, OpenAIApi } from "openai";


var openAiConfig = null;
if (process.env.OPENAI_ORG_ID) {
    openAiConfig = new Configuration({
        organization: process.env.OPENAI_ORG_ID,
        apiKey: process.env.OPENAI_API_KEY,
    });
} else {
    openAiConfig = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
    });
}
const openai = new OpenAIApi(openAiConfig);


export async function sendRequest(turns, systemMessage) {

    let messages = [{"role": "system", "content": systemMessage}];
    for (let i = 0; i < turns.length; i++) {
        if (i % 2 == 0) {
            messages.push({"role": "user", "content": turns[i]});
        } else {
            messages.push({"role": "assistant", "content": turns[i]});
        }
    }

    let res = null;
    try {
        let completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: messages,
        });
        res = completion.data.choices[0].message.content;
    }
    catch (err) {
        console.log(err);
        res = "I'm sorry, I don't know how to respond to that.";
    }
    return res;
}
