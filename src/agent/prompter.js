import { readFileSync, mkdirSync, writeFileSync} from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs } from './commands/index.js';
import { getSkillDocs } from './library/index.js';
import { stringifyTurns } from '../utils/text.js';
import { getCommand } from './commands/index.js';

import { Gemini } from '../models/gemini.js';
import { GPT } from '../models/gpt.js';
import { Claude } from '../models/claude.js';
import { Local } from '../models/local.js';


export class Prompter {
    constructor(agent, fp) {
        this.agent = agent;
        this.prompts = JSON.parse(readFileSync(fp, 'utf8'));
        this.convo_examples = null;
        this.coding_examples = null;

        let name = this.prompts.name;
        let chat = this.prompts.model;
        if (typeof chat === 'string' || chat instanceof String) {
            chat = {model: chat};
            if (chat.model.includes('gemini'))
                chat.api = 'google';
            else if (chat.model.includes('gpt'))
                chat.api = 'openai';
            else if (chat.model.includes('claude'))
                chat.api = 'anthropic';
            else
                chat.api = 'ollama';
        }

        console.log('Using chat settings:', chat);

        if (chat.api == 'google')
            this.chat_model = new Gemini(chat.model, chat.url);
        else if (chat.api == 'openai')
            this.chat_model = new GPT(chat.model, chat.url);
        else if (chat.api == 'anthropic')
            this.chat_model = new Claude(chat.model, chat.url);
        else if (chat.api == 'ollama')
            this.chat_model = new Local(chat.model, chat.url);
        else
            throw new Error('Unknown API:', api);

        let embedding = this.prompts.embedding;
        if (embedding === undefined)
            embedding = {api: chat.api};
        else if (typeof embedding === 'string' || embedding instanceof String)
            embedding = {api: embedding};

        console.log('Using embedding settings:', embedding);

        if (embedding.api == 'google')
            this.embedding_model = new Gemini(embedding.model, embedding.url);
        else if (embedding.api == 'openai')
            this.embedding_model = new GPT(embedding.model, embedding.url);
        else if (embedding.api == 'ollama')
            this.embedding_model = new Local(embedding.model, embedding.url);
        else {
            this.embedding_model = null;
            console.log('Unknown embedding: ', embedding ? embedding.api : '[NOT SPECIFIED]', '. Using word overlap.');
        }

        mkdirSync(`./bots/${name}`, { recursive: true });
        writeFileSync(`./bots/${name}/last_profile.json`, JSON.stringify(this.prompts, null, 4), (err) => {
            if (err) {
                throw err;
            }
            console.log("Copy profile saved.");
        });
    }

    getName() {
        return this.prompts.name;
    }

    async initExamples() {
        console.log('Loading examples...')
        this.convo_examples = new Examples(this.embedding_model);
        await this.convo_examples.load(this.prompts.conversation_examples);
        this.coding_examples = new Examples(this.embedding_model);
        await this.coding_examples.load(this.prompts.coding_examples);
        console.log('Examples loaded.');
    }

    async replaceStrings(prompt, messages, examples=null, prev_memory=null, to_summarize=[], last_goals=null) {
        prompt = prompt.replaceAll('$NAME', this.agent.name);

        if (prompt.includes('$STATS')) {
            let stats = await getCommand('!stats').perform(this.agent);
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY')) {
            let inventory = await getCommand('!inventory').perform(this.agent);
            prompt = prompt.replaceAll('$INVENTORY', inventory);
        }
        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', getCommandDocs());
        if (prompt.includes('$CODE_DOCS'))
            prompt = prompt.replaceAll('$CODE_DOCS', getSkillDocs());
        if (prompt.includes('$EXAMPLES') && examples !== null)
            prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages));
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', prev_memory ? prev_memory : 'None.');
        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO'))
            prompt = prompt.replaceAll('$CONVO', 'Recent conversation:\n' + stringifyTurns(messages));
        if (prompt.includes('$LAST_GOALS')) {
            let goal_text = '';
            for (let goal in last_goals) {
                if (last_goals[goal])
                    goal_text += `You recently successfully completed the goal ${goal}.\n`
                else
                    goal_text += `You recently failed to complete the goal ${goal}.\n`
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goal_text.trim());
        }
        if (prompt.includes('$BLUEPRINTS')) {
            if (this.agent.npc.constructions) {
                let blueprints = '';
                for (let blueprint in this.agent.npc.constructions) {
                    blueprints += blueprint + ', ';
                }
                prompt = prompt.replaceAll('$BLUEPRINTS', blueprints.slice(0, -2));
            }
        }

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
        return prompt;
    }

    async promptConvo(messages) {
        let prompt = this.prompts.conversing;
        prompt = await this.replaceStrings(prompt, messages, this.convo_examples);
        return await this.chat_model.sendRequest(messages, prompt);
    }

    async promptCoding(messages) {
        let prompt = this.prompts.coding;
        prompt = await this.replaceStrings(prompt, messages, this.coding_examples);
        return await this.chat_model.sendRequest(messages, prompt);
    }

    async promptMemSaving(prev_mem, to_summarize) {
        let prompt = this.prompts.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, prev_mem, to_summarize);
        return await this.chat_model.sendRequest([], prompt);
    }

    async promptGoalSetting(messages, last_goals) {
        let system_message = this.prompts.goal_setting;
        system_message = await this.replaceStrings(system_message, messages);

        let user_message = 'Use the below info to determine what goal to target next\n\n';
        user_message += '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO'
        user_message = await this.replaceStrings(user_message, messages, null, null, null, last_goals);
        let user_messages = [{role: 'user', content: user_message}];

        let res = await this.model.sendRequest(user_messages, system_message);

        let goal = null;
        try {
            let data = res.split('```')[1].replace('json', '').trim();
            goal = JSON.parse(data);
        } catch (err) {
            console.log('Failed to parse goal:', res, err);
        }
        if (!goal || !goal.name || !goal.quantity || isNaN(parseInt(goal.quantity))) {
            console.log('Failed to set goal:', res);
            return null;
        }
        goal.quantity = parseInt(goal.quantity);
        return goal;
    }
}