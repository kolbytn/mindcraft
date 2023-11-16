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
            model: 'gpt-3.5-turbo-1106',
            messages: messages,
            stop: stop_seq,
        });
        res = completion.choices[0].message.content;
    }
    catch (err) {
        if (err.code == 'context_length_exceeded' && turns.length > 1) {
            console.log('Context length exceeded, trying again with shorter context.');
            return await sendRequest(turns.slice(1), systemMessage, stop_seq);
        } else {
            console.log(err);
            res = 'My brain disconnected, try again.';
        }
    }
    return res;
}


export async function embed(text) {
    const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
        encoding_format: "float",
    });
    return embedding.data[0].embedding;
}

export function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];  // calculate dot product
        magnitudeA += Math.pow(a[i], 2);  // calculate magnitude of a
        magnitudeB += Math.pow(b[i], 2);  // calculate magnitude of b
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    return dotProduct / (magnitudeA * magnitudeB);  // calculate cosine similarity
}