import { readFileSync } from 'fs';
import { cosineSimilarity } from './math.js';
import { stringifyTurns } from './text.js';
import { embed } from '../models/model.js';


export class Examples {
    constructor(select_num=2) {
        this.examples = [];
        this.select_num = select_num;
    }

    async load(path) {
        let examples = [];
        try {
            const data = readFileSync(path, 'utf8');
            examples = JSON.parse(data);
        } catch (err) {
            console.error('Examples failed to load!', err);
        }

        this.examples = [];
        for (let example of examples) {
            let messages = '';
            for (let turn of example) {
                if (turn.role != 'assistant')
                    messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
            }
            messages = messages.trim();
            const embedding = await embed(messages);
            this.examples.push({'embedding': embedding, 'turns': example});
        }
    }

    async getRelevant(turns) {
        let messages = '';
        for (let turn of turns) {
            if (turn.role != 'assistant')
                messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
        }
        messages = messages.trim();
        const embedding = await embed(messages);
        this.examples.sort((a, b) => {
            return cosineSimilarity(b.embedding, embedding) - cosineSimilarity(a.embedding, embedding);
        });
        let selected = this.examples.slice(0, this.select_num);
        return JSON.parse(JSON.stringify(selected)); // deep copy
    }

    async createExampleMessage(turns) {
        let selected_examples = await this.getRelevant(turns);

        console.log('selected examples:');
        for (let example of selected_examples) {
            console.log(example.turns[0].content)
        }

        let msg = 'Here are some examples of how to respond:\n';
        for (let i=0; i<selected_examples.length; i++) {
            let example = selected_examples[i];
            msg += `Example ${i+1}:\n${stringifyTurns(example.turns)}\n\n`;
        }
        return [{'role': 'system', 'content': msg}];
    }
}