import { cosineSimilarity } from './math.js';
import { stringifyTurns, wordOverlapScore } from './text.js';
import { embedWithProgress } from './rate_limiter.js';

export class Examples {
    constructor(model, select_num=2, cacheKey='examples') {
        this.examples = [];
        this.model = model;
        this.select_num = select_num;
        this.embeddings = {};
        this.cacheKey = cacheKey;
    }

    turnsToText(turns) {
        let messages = '';
        for (let turn of turns) {
            if (turn.role !== 'assistant')
                messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
        }
        return messages.trim();
    }

    async load(examples) {
        this.examples = examples;
        if (!this.model) return; // Early return if no embedding model
        
        if (this.select_num === 0)
            return;

        try {
            const textsToEmbed = examples.map(example => this.turnsToText(example));
            const modelName = this.model.model_name || this.model.constructor?.name || 'unknown';
            
            const embeddings = await embedWithProgress(
                textsToEmbed,
                async (text) => await this.model.embed(text),
                this.cacheKey,
                {
                    cacheKey: this.cacheKey,
                    modelName: modelName,
                    getTextFn: (text) => text
                }
            );
            
            for (const [text, embedding] of embeddings) {
                this.embeddings[text] = embedding;
            }
        } catch (err) {
            console.warn('Error with embedding model, using word-overlap instead.');
            this.model = null;
        }
    }

    async getRelevant(turns) {
        if (this.select_num === 0)
            return [];

        let turn_text = this.turnsToText(turns);
        if (this.model !== null) {
            let embedding = await this.model.embed(turn_text);
            this.examples.sort((a, b) => 
                cosineSimilarity(embedding, this.embeddings[this.turnsToText(b)]) -
                cosineSimilarity(embedding, this.embeddings[this.turnsToText(a)])
            );
        }
        else {
            this.examples.sort((a, b) => 
                wordOverlapScore(turn_text, this.turnsToText(b)) -
                wordOverlapScore(turn_text, this.turnsToText(a))
            );
        }
        let selected = this.examples.slice(0, this.select_num);
        return JSON.parse(JSON.stringify(selected)); // deep copy
    }

    async createExampleMessage(turns) {
        let selected_examples = await this.getRelevant(turns);

        console.log('selected examples:');
        for (let example of selected_examples) {
            console.log('Example:', example[0].content)
        }

        let msg = 'Examples of how to respond:\n';
        for (let i=0; i<selected_examples.length; i++) {
            let example = selected_examples[i];
            msg += `Example ${i+1}:\n${stringifyTurns(example)}\n\n`;
        }
        return msg;
    }
}