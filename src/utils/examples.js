import { cosineSimilarity } from './math.js';
import { stringifyTurns } from './text.js';

export class Examples {
    constructor(model, select_num=2) {
        this.examples = [];
        this.model = model;
        this.select_num = select_num;
        this.embeddings = {};
    }

    turnsToText(turns) {
        let messages = '';
        for (let turn of turns) {
            // console.log('$$$$$$$$$$$$$$$$$')
            // console.log(turn)
            if (turn.role !== undefined){
                if (turn.role !== 'assistant')
                    messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
            }
            else { // no role, just text,for skillDocs
                messages += turn.trim() + '\n';
            }
        }
        return messages.trim();
    }

    getWords(text) {
        return text.replace(/[^a-zA-Z ]/g, '').toLowerCase().split(' ');
    }

    wordOverlapScore(text1, text2) {
        const words1 = this.getWords(text1);
        const words2 = this.getWords(text2);
        const intersection = words1.filter(word => words2.includes(word));
        return intersection.length / (words1.length + words2.length - intersection.length);
    }

    //Handle all embedded tasks simultaneously for faster loading
    async load(examples) {
        this.examples = examples;
        if (this.model !== null) {
            const embeddingPromises = this.examples.map(async (example) => {
                let turn_text = this.turnsToText(example);
                // console.log('loading example:', turn_text)

                this.embeddings[turn_text] = await this.model.embed(turn_text);
            });
            await Promise.all(embeddingPromises);
        }
    }

    async getRelevant(turns,select_num=this.select_num) {
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
                this.wordOverlapScore(turn_text, this.turnsToText(b)) -
                this.wordOverlapScore(turn_text, this.turnsToText(a))
            );
        }
        let selected = this.examples.slice(0, select_num);

        let selected_copy = JSON.parse(JSON.stringify(selected));// deep copy
        if (selected_copy == undefined) {
            selected_copy = selected;
        }

        return selected_copy;
    }

    async createExampleMessage(turns,select_num=this.select_num) {
        let selected_examples = await this.getRelevant(turns,select_num);

        console.log('selected examples:');
        for (let example of selected_examples) {
            console.log(example[0].content)
        }
        let msg = 'Examples of how to respond:\n';

        for (let i=0; i<selected_examples.length; i++) {
            let example = selected_examples[i];
            msg += `Example ${i+1}:\n${stringifyTurns(example)}\n\n`;
        }
        return msg;
    }
    async getRelevantSkillDocs(turns,select_num=this.select_num) {
        let selected_examples = await this.getRelevant(turns,select_num);

        // console.log('selected func Docs:');
        // for (let example of selected_examples) {
        //     console.log(example)
        // }
        let msg = 'The following recommended functions are arranged in order of task relevance from highest to lowest.\nSkillDocs:\n';

        for (let i=0; i<selected_examples.length; i++) {
            let example = selected_examples[i];
            msg += `function ${i+1}:\n${example}\n\n`;
        }
        return msg;
    }

    //add new function to get the this.embeddings
    async addNewExample(example) {
        this.examples.push(example);
        if (this.model !== null) {
            let turn_text = this.turnsToText(example);
            this.embeddings[turn_text] = await this.model.embed(turn_text);
        }
    }

}