import { readFileSync, mkdirSync, writeFileSync} from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs } from './commands/index.js';
import { getSkillDocs } from './library/index.js';
import { stringifyTurns } from '../utils/text.js';
import { getCommand } from './commands/index.js';

import { Gemini } from '../models/gemini.js';
import { GPT } from '../models/gpt.js';
import { Claude } from '../models/claude.js';
import { ReplicateAPI } from '../models/replicate.js';
import { Local } from '../models/local.js';
import { Novita } from '../models/novita.js';
import { GroqCloudAPI } from '../models/groq.js';
import { HuggingFace } from '../models/huggingface.js';
import { Qwen } from "../models/qwen.js";
import { Grok } from "../models/grok.js";

export class Prompter {
    constructor(agent, fp) {
        this.agent = agent;
        this.profile = JSON.parse(readFileSync(fp, 'utf8'));
        this.default_profile = JSON.parse(readFileSync('./profiles/_default.json', 'utf8'));

        for (let key in this.default_profile) {
            if (this.profile[key] === undefined)
                this.profile[key] = this.default_profile[key];
        }

        this.convo_examples = null;
        this.coding_examples = null;
        
        let name = this.profile.name;
        let chat = this.profile.model;
        this.cooldown = this.profile.cooldown ? this.profile.cooldown : 0;
        this.last_prompt_time = 0;

        // try to get "max_tokens" parameter, else null
        let max_tokens = null;
        if (this.profile.max_tokens)
            max_tokens = this.profile.max_tokens;
        if (typeof chat === 'string' || chat instanceof String) {
            chat = {model: chat};
            if (chat.model.includes('gemini'))
                chat.api = 'google';
            else if (chat.model.includes('gpt') || chat.model.includes('o1'))
                chat.api = 'openai';
            else if (chat.model.includes('claude'))
                chat.api = 'anthropic';
            else if (chat.model.includes('huggingface/'))
                chat.api = "huggingface";
            else if (chat.model.includes('meta/') || chat.model.includes('mistralai/') || chat.model.includes('replicate/'))
                chat.api = 'replicate';
            else if (chat.model.includes("groq/") || chat.model.includes("groqcloud/"))
                chat.api = 'groq';
            else if (chat.model.includes('novita/'))
                chat.api = 'novita';
            else if (chat.model.includes('qwen'))
                chat.api = 'qwen';
            else if (chat.model.includes('grok'))
                chat.api = 'xai';
            else
                chat.api = 'ollama';
        }

        console.log('Using chat settings:', chat);

        if (chat.api === 'google')
            this.chat_model = new Gemini(chat.model, chat.url);
        else if (chat.api === 'openai')
            this.chat_model = new GPT(chat.model, chat.url);
        else if (chat.api === 'anthropic')
            this.chat_model = new Claude(chat.model, chat.url);
        else if (chat.api === 'replicate')
            this.chat_model = new ReplicateAPI(chat.model, chat.url);
        else if (chat.api === 'ollama')
            this.chat_model = new Local(chat.model, chat.url);
        else if (chat.api === 'groq') {
            this.chat_model = new GroqCloudAPI(chat.model.replace('groq/', '').replace('groqcloud/', ''), chat.url, max_tokens ? max_tokens : 8192);
        }
        else if (chat.api === 'huggingface')
            this.chat_model = new HuggingFace(chat.model, chat.url);
        else if (chat.api === 'novita')
            this.chat_model = new Novita(chat.model.replace('novita/', ''), chat.url);
        else if (chat.api === 'qwen')
            this.chat_model = new Qwen(chat.model, chat.url);
        else if (chat.api === 'xai')
            this.chat_model = new Grok(chat.model, chat.url);
        else
            throw new Error('Unknown API:', api);

        let embedding = this.profile.embedding;
        if (embedding === undefined) {
            if (chat.api !== 'ollama')
                embedding = {api: chat.api};
            else
                embedding = {api: 'none'};
        }
        else if (typeof embedding === 'string' || embedding instanceof String)
            embedding = {api: embedding};

        console.log('Using embedding settings:', embedding);

        try {
            if (embedding.api === 'google')
                this.embedding_model = new Gemini(embedding.model, embedding.url);
            else if (embedding.api === 'openai')
                this.embedding_model = new GPT(embedding.model, embedding.url);
            else if (embedding.api === 'replicate')
                this.embedding_model = new ReplicateAPI(embedding.model, embedding.url);
            else if (embedding.api === 'ollama')
                this.embedding_model = new Local(embedding.model, embedding.url);
            else if (embedding.api === 'qwen')
                this.embedding_model = new Qwen(embedding.model, embedding.url);
            else {
                this.embedding_model = null;
                console.log('Unknown embedding: ', embedding ? embedding.api : '[NOT SPECIFIED]', '. Using word overlap.');
            }
        }
        catch (err) {
            console.log('Warning: Failed to initialize embedding model:', err.message);
            console.log('Continuing anyway, using word overlap instead.');
            this.embedding_model = null;
        }

        mkdirSync(`./bots/${name}`, { recursive: true });
        writeFileSync(`./bots/${name}/last_profile.json`, JSON.stringify(this.profile, null, 4), (err) => {
            if (err) {
                throw new Error('Failed to save profile:', err);
            }
            console.log("Copy profile saved.");
        });
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async initExamples() {
        try {
            this.convo_examples = new Examples(this.embedding_model);
            this.coding_examples = new Examples(this.embedding_model);
            
            // Wait for both examples to load before proceeding
            await Promise.all([
                this.convo_examples.load(this.profile.conversation_examples),
                this.coding_examples.load(this.profile.coding_examples)
            ]);

            console.log('Examples initialized.');
        } catch (error) {
            console.error('Failed to initialize examples:', error);
            throw error;
        }
    }

    async replaceStrings(prompt, messages, examples=null, to_summarize=[], last_goals=null) {
        prompt = prompt.replaceAll('$NAME', this.agent.name);

        if (prompt.includes('$TASK_GOAL')) {
            prompt = prompt.replaceAll('$TASK_GOAL', process.env.MINECRAFT_TASK_GOAL || 'No task specified');
        }

        if (prompt.includes('$OTHER_AGENTS')) {
            const allAgentNames = process.env.ALL_AGENT_NAMES.split(',');
            const otherAgents = allAgentNames.filter(curr_agent_name => curr_agent_name  !== this.agent.name);
            prompt = prompt.replace('$OTHER_AGENTS', otherAgents.join(', '));
        }

        if (prompt.includes('$STATS')) {
            let stats = await getCommand('!stats').perform(this.agent);
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY')) {
            let inventory = await getCommand('!inventory').perform(this.agent);
            prompt = prompt.replaceAll('$INVENTORY', inventory);
        }
        if (prompt.includes('$ACTION')) {
            prompt = prompt.replaceAll('$ACTION', this.agent.actions.currentActionLabel);
        }
        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', getCommandDocs());
        if (prompt.includes('$CODE_DOCS'))
            prompt = prompt.replaceAll('$CODE_DOCS', getSkillDocs());
        if (prompt.includes('$EXAMPLES') && examples !== null)
            prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages));
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', this.agent.history.memory);
        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO'))
            prompt = prompt.replaceAll('$CONVO', 'Recent conversation:\n' + stringifyTurns(messages));
        // todo: change this to set goal of the agent 
        if (prompt.includes('$SELF_PROMPT')) {
            let self_prompt = this.agent.self_prompter.on ? `YOUR CURRENT ASSIGNED GOAL: "${this.agent.self_prompter.prompt}"\n` : '';
            prompt = prompt.replaceAll('$SELF_PROMPT', self_prompt);
        }
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

    async checkCooldown() {
        let elapsed = Date.now() - this.last_prompt_time;
        if (elapsed < this.cooldown && this.cooldown > 0) {
            await new Promise(r => setTimeout(r, this.cooldown - elapsed));
        }
        this.last_prompt_time = Date.now();
    }

    async promptConvo(messages) {
        for (let i = 0; i < 3; i++) { // try 3 times to avoid hallucinations
            await this.checkCooldown();
            let prompt = this.profile.conversing;
            prompt = await this.replaceStrings(prompt, messages, this.convo_examples);
            let generation = await this.chat_model.sendRequest(messages, prompt);
            // in conversations >2 players LLMs tend to hallucinate and role-play as other bots
            // the FROM OTHER BOT tag should never be generated by the LLM
            if (generation.includes('(FROM OTHER BOT)')) {
                console.warn('LLM hallucinated message as another bot. Trying again...');
                continue;
            }
            return generation;
        }
        return "*no response*";
    }

    async promptCoding(messages) {
        await this.checkCooldown();
        let prompt = this.profile.coding;
        prompt = await this.replaceStrings(prompt, messages, this.coding_examples);
        return await this.chat_model.sendRequest(messages, prompt);
    }

    async promptMemSaving(to_summarize) {
        await this.checkCooldown();
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, to_summarize);
        return await this.chat_model.sendRequest([], prompt);
    }

    async promptShouldRespondToBot(new_message) {
        await this.checkCooldown();
        let prompt = this.profile.bot_responder;
        let messages = this.agent.history.getHistory();
        messages.push({role: 'user', content: new_message});
        prompt = await this.replaceStrings(prompt, null, null, messages);
        let res = await this.chat_model.sendRequest([], prompt);
        return res.trim().toLowerCase() === 'respond';
    }

    async promptGoalSetting(messages, last_goals) {
        let system_message = this.profile.goal_setting;
        system_message = await this.replaceStrings(system_message, messages);

        let user_message = 'Use the below info to determine what goal to target next\n\n';
        user_message += '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO'
        user_message = await this.replaceStrings(user_message, messages, null, null, last_goals);
        let user_messages = [{role: 'user', content: user_message}];

        let res = await this.chat_model.sendRequest(user_messages, system_message);

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
