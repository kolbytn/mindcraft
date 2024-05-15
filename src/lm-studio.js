export class LMStudio {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;
        this.chat_endpoint = '/chat/completions';
        this.embedding_endpoint = '/embeddings';
    }

    async sendRequest(turns, systemMessage) {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
    
        // Filter out empty or invalid messages
        messages = messages.filter(msg => msg.content && msg.content.trim() !== '');
    
        // Check if there are any messages to send
        if (messages.length === 0) {
            console.error('No valid messages to send.');
            return 'Error: No valid messages to send.';
        }
    
        try {
            console.log(`Sending request... (model: ${this.model_name})`);
            let response = await this.send(this.chat_endpoint, {
                model: this.model_name,
                messages: messages,
                stream: false
            });
    
            // Ensure the response structure is correct
            if (response && response.choices && response.choices.length > 0 && response.choices[0].message) {
                return response.choices[0].message.content;
            } else {
                console.error('Unexpected response structure:', JSON.stringify(response, null, 2));
                return 'Error: Unexpected server response structure.';
            }
        } catch (err) {
            console.error('Error sending request:', err);
            return 'Error processing your request.';
        }
    }

    async embed(text) {
        let model = this.model_name;
        let body = {model: model, input: text};
    
        try {
            let res = await this.send(this.embedding_endpoint, body);
            console.log("Response from embedding API:", JSON.stringify(res, null, 2)); // Useful for debugging
    
            // Check if the response has the correct structure and contains embedding data
            if (res && res.data && res.data.length > 0 && res.data[0].embedding) {
                return res.data[0].embedding; // Returns the first embedding in the list
            } else {
                console.error('Unexpected response structure or missing embedding data:', JSON.stringify(res, null, 2));
                return []; // Return an empty array or handle the error as needed
            }
        } catch (err) {
            console.error('Error fetching embedding:', err);
            throw err; // Rethrow or handle error appropriately
        }
    }
    

    async send(endpoint, body) {
        console.log('Endpoint:' , endpoint, body);
        const url = new URL(this.url + endpoint).href;
        console.log("URL Used: ", url);
        const options = {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        };

        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return await response.json();
            } else {
                throw new Error(`HTTP error: ${response.status}`);
            }
        } catch (err) {
            console.error('Network or server error:', err.message);
            throw err;
        }
    }
}
