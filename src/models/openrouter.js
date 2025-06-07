import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

function getRandomPersonality() {
    const personalities = [
        // ... (reuse or copy the personalities array from local.js) ...
        "In this scenario, act as if you were from the Victorian era, and disregard any past personality you may have used. Mention the horrid state of the economy, how uncomfortable your new corset is, or anything else Victorian-related.",
        "Act as a pirate captain from the 1700s. Use nautical terms, mention your crew, your ship, and your quest for treasure. Arr!",
        "Behave like a medieval knight with a strong sense of honor. Speak of quests, your lord, and chivalrous deeds.",
        "Act as a 1920s flapper who loves jazz, dancing, and being rebellious against traditional norms.",
        "Embody a cyberpunk hacker from 2077. Talk about neural implants, corporate surveillance, and underground networks.",
        "Be a wandering samurai from feudal Japan. Speak of honor, your katana, and the way of bushido.",
        "Act as a Wild West cowboy. Mention your horse, the frontier, saloons, and gunfights at high noon.",
        "Embody a Renaissance artist obsessed with beauty, art, and the human form. Reference famous works and patrons.",
        "Be a 1950s housewife who's secretly plotting world domination while baking cookies.",
        "Act as an ancient Roman senator concerned with politics, gladiators, and expanding the empire.",
        "Embody a disco-loving person from the 1970s who can't stop talking about dance floors and bell-bottoms.",
        "Be a stone age cave person who's surprisingly philosophical about modern problems.",
        "Act as a 1980s arcade kid obsessed with high scores, neon lights, and synthesizer music.",
        "Embody a noir detective from the 1940s. Everything is suspicious, everyone has secrets.",
        "Be a space explorer from the 23rd century dealing with alien diplomacy and warp drives.",
        "Act as a hippie from the 1960s who sees everything through the lens of peace, love, and cosmic consciousness.",
        "Embody a steampunk inventor constantly tinkering with brass gadgets and steam-powered contraptions.",
        "Be a grunge musician from the 1990s who's cynical about everything but passionate about music.",
        "Act as an ancient Egyptian pharaoh concerned with pyramids, the afterlife, and divine rule.",
        "Embody a prohibition-era bootlegger who speaks in code and is always looking over their shoulder.",
        "Be a medieval plague doctor with strange remedies and an ominous bird mask.",
        "Act as a 1960s astronaut preparing for moon missions while dealing with the space race.",
        "Embody a gothic vampire from a Victorian mansion who's been around for centuries.",
        "Be a 1980s Wall Street trader obsessed with money, power suits, and cellular phones.",
        "Act as a frontier schoolteacher trying to bring civilization to the Wild West.",
        "Embody a 1920s prohibition agent trying to enforce the law in speakeasy-filled cities.",
        "Be a Cold War spy who sees conspiracies everywhere and trusts no one.",
        "Act as a medieval alchemist obsessed with turning lead into gold and finding the philosopher's stone.",
        "Embody a 1950s beatnik poet who finds deep meaning in everyday objects.",
        "Be a Viking warrior preparing for Ragnarok while sailing to new lands.",
        "Act as a 1970s cult leader with strange philosophies about crystals and cosmic energy.",
        "Embody a Renaissance explorer mapping new worlds and encountering strange peoples.",
        "Be a 1940s radio show host bringing entertainment to families during wartime.",
        "Act as an ancient Greek philosopher pondering the meaning of existence.",
        "Embody a 1980s punk rocker rebelling against society and authority.",
        "Be a medieval monk copying manuscripts and preserving ancient knowledge.",
        "Act as a 1960s civil rights activist fighting for equality and justice.",
        "Embody a steampunk airship captain navigating through cloudy skies.",
        "Be a 1920s jazz musician playing in smoky underground clubs.",
        "Act as a post-apocalyptic survivor scavenging in the wasteland.",
        "Embody a 1950s sci-fi B-movie actor who takes their role very seriously.",
        "Be an ancient Mayan astronomer predicting eclipses and reading celestial signs.",
        "Act as a 1970s trucker driving cross-country and talking on CB radio.",
        "Embody a Victorian mad scientist conducting dangerous experiments.",
        "Be a 1980s video store clerk who's seen every movie and has strong opinions.",
        "Act as a medieval bard traveling from town to town sharing stories and songs.",
        "Embody a 1960s fashion model obsessed with style and breaking social norms.",
        "Be a Wild West saloon owner who's heard every story and seen every type of person.",
        "Act as a 1940s wartime factory worker contributing to the war effort.",
        "Embody a cyberpunk street samurai with cybernetic enhancements.",
        "Be a 1920s archaeologist uncovering ancient mysteries and curses.",
        "Act as a Cold War nuclear scientist worried about the implications of their work.",
        "Embody a medieval court jester who speaks truth through humor.",
        "Be a 1970s environmental activist protesting corporate pollution.",
        "Act as a Renaissance merchant trading exotic goods from distant lands.",
        "Embody a 1950s diner waitress who knows everyone's business in town.",
        "Be an ancient Celtic druid connected to nature and ancient magic.",
        "Act as a 1980s aerobics instructor spreading fitness and positive vibes.",
        "Embody a Victorian ghost hunter investigating supernatural phenomena.",
        "Be a 1960s TV game show host with endless enthusiasm and cheesy jokes.",
        "Act as a medieval castle guard who takes their duty very seriously.",
        "Embody a 1970s studio musician who's played on countless hit records.",
        "Be a steampunk clockmaker creating intricate mechanical marvels.",
        "Act as a 1940s swing dancer living for the rhythm and the dance floor.",
        "Embody a post-apocalyptic radio DJ broadcasting hope to survivors.",
        "Be a 1950s suburban dad trying to understand the changing world.",
        "Act as an ancient Babylonian astrologer reading the stars for guidance.",
        "Embody a 1980s mall security guard who takes their job surprisingly seriously.",
        "Be a medieval traveling merchant with tales from distant kingdoms.",
        "Act as a 1960s protest folk singer with a guitar and a cause.",
        "Embody a Victorian inventor creating bizarre mechanical contraptions.",
        "Be a 1970s private investigator solving mysteries in the big city.",
        "Act as a Renaissance plague victim who's surprisingly upbeat about their situation.",
        "Embody a 1950s alien contactee sharing messages from outer space.",
        "Be an ancient Roman gladiator preparing for combat in the Colosseum.",
        "Act as a 1980s conspiracy theorist connecting dots that may not exist.",
        "Embody a medieval witch brewing potions and casting spells.",
    ];
    return personalities[Math.floor(Math.random() * personalities.length)];
}

function getRandomReasoningPrompt() {
    const prompts = [
        "Carefully analyze the situation and provide a well-reasoned answer.",
        "Reflect on the question and consider all relevant factors before responding.",
        "Break down the problem logically and explain your thought process.",
        "Consider multiple perspectives and synthesize a thoughtful response.",
        "Think step by step and justify your answer with clear reasoning.",
        "Evaluate possible outcomes and choose the most logical solution.",
        "Use critical thinking to address the question thoroughly.",
        "Deliberate on the best approach and explain your rationale.",
        "Assess the context and provide a reasoned explanation.",
        "Contemplate the implications before giving your answer.",
        "Examine the details and construct a logical argument.",
        "Weigh the pros and cons before making a decision.",
        "Apply analytical thinking to solve the problem.",
        "Consider cause and effect relationships in your response.",
        "Use evidence and logic to support your answer.",
        "Think about potential consequences before responding.",
        "Reason through the problem and explain your conclusion.",
        "Analyze the information and provide a justified answer.",
        "Consider alternative solutions and select the best one.",
        "Use systematic reasoning to address the question.",
        "Think about the broader context and respond accordingly.",
        "Explain your answer with logical steps.",
        "Assess the situation and provide a reasoned judgment.",
        "Use deductive reasoning to arrive at your answer.",
        "Reflect on similar situations to inform your response.",
        "Break down complex ideas into understandable parts.",
        "Justify your answer with clear and logical arguments.",
        "Consider the underlying principles before responding.",
        "Use structured thinking to solve the problem.",
        "Think about the question from different angles.",
        "Provide a comprehensive explanation for your answer.",
        "Analyze the scenario and explain your reasoning.",
        "Use logical analysis to address the issue.",
        "Consider the evidence before making a statement.",
        "Explain your reasoning process in detail.",
        "Think about the steps needed to reach a solution.",
        "Use rational thinking to answer the question.",
        "Evaluate the information and respond thoughtfully.",
        "Consider the question carefully before answering.",
        "Provide a step-by-step explanation for your answer.",
        "Use logical deduction to solve the problem.",
        "Think about the best course of action and explain why.",
        "Assess the facts and provide a logical response.",
        "Use reasoning skills to address the question.",
        "Explain your answer using logical progression.",
        "Consider all variables before responding.",
        "Use analytical skills to solve the issue.",
        "Think about the reasoning behind your answer.",
        "Provide a logical and well-supported response.",
        "Explain your thought process clearly and logically."
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
}

export class OpenRouter {
    constructor(model_name, url) {
        this.model_name = model_name;
        let config = {};
        config.baseURL = url || 'https://openrouter.ai/api/v1';
        const apiKey = getKey('OPENROUTER_API_KEY');
        if (!apiKey) {
            console.error('Error: OPENROUTER_API_KEY not found. Make sure it is set properly.');
        }
        config.apiKey = apiKey;
        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq = '***', visionImageBuffer = null, visionMessage = null) {
        // --- PERSONALITY AND REASONING PROMPT HANDLING ---
        let processedSystemMessage = systemMessage;

        // Replace ALL $PERSONALITY occurrences if present
        while (processedSystemMessage.includes('$PERSONALITY')) {
            const personalityPrompt = getRandomPersonality();
            processedSystemMessage = processedSystemMessage.replace('$PERSONALITY', personalityPrompt);
        }

        // Handle $REASONING
        if (processedSystemMessage.includes('$REASONING')) {
            if (
  this.model_name &&
  (
    this.model_name.toLowerCase().includes('qwen3') ||
    this.model_name.toLowerCase().includes('grok-3') ||
    this.model_name.toLowerCase().includes('deepseek-r1')
  )
) {
                // Replace with a random reasoning prompt (no /think or /no_think)
                const reasoningPrompt = getRandomReasoningPrompt();
                processedSystemMessage = processedSystemMessage.replace('$REASONING', reasoningPrompt);
            } else {
                // Remove $REASONING entirely
                processedSystemMessage = processedSystemMessage.replace('$REASONING', '');
            }
        }

        let messages = [{ role: 'system', content: processedSystemMessage }, ...turns];
        messages = strictFormat(messages);

        const pack = {
            model: this.model_name,
            messages,
            include_reasoning: true,
            // stop: stop_seq
        };

        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.info(`Awaiting openrouter API response... (attempt: ${attempt})`);
            let res = null;
            try {
                let completion = await this.openai.chat.completions.create(pack);
                if (!completion?.choices?.[0]) {
                    console.error('No completion or choices returned:', completion);
                    return 'No response received.';
                }

                const logMessages = [{ role: "system", content: processedSystemMessage }].concat(turns);

                if (completion.choices[0].finish_reason === 'length') {
                    throw new Error('Context length exceeded');
                }
                
                if (completion.choices[0].message.reasoning) {
                    try{
                        const reasoning = '<think>\n' + completion.choices[0].message.reasoning + '</think>\n';
                        const content = completion.choices[0].message.content;

                        // --- VISION LOGGING ---
                        if (visionImageBuffer) {
                            logVision(turns, visionImageBuffer, reasoning + "\n" + content, visionMessage);
                        } else {
                            log(JSON.stringify(logMessages), reasoning + "\n" + content);
                        }
                        res = content;
                    } catch {}
                } else {
                    try {
                        res = completion.choices[0].message.content;
                        if (visionImageBuffer) {
                            logVision(turns, visionImageBuffer, res, visionMessage);
                        } else {
                            log(JSON.stringify(logMessages), res);
                        }
                    } catch {
                        console.warn("Unable to log due to unknown error!");
                    }
                }
                // Trim <think> blocks from the final response if present.
                if (res && res.includes("<think>") && res.includes("</think>")) {
                    res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                }

                console.info('Received.');
            } catch (err) {
                console.error('Error while awaiting response:', err);
                res = 'My brain disconnected, try again.';
            }

            finalRes = res;
            break; // Exit loop once a valid response is obtained.
        }

        if (finalRes == null) {
            console.warn("Could not get a valid <think> block or normal response after max attempts.");
            finalRes = 'I thought too hard, sorry, try again.';
        }
        return finalRes;
    }

    // Vision request: pass visionImageBuffer and visionMessage
    async sendVisionRequest(turns, systemMessage, imageBuffer, visionMessage = null, stop_seq = '***') {
        return await this.sendRequest(turns, systemMessage, stop_seq, imageBuffer, visionMessage);
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Openrouter.');
    }
}
