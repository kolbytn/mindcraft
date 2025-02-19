import { cosineSimilarity } from '../../utils/math.js';
import { getSkillDocs } from './index.js';
import { wordOverlapScore } from '../../utils/text.js';

export class SkillLibrary {
    constructor(agent,embedding_model) {
        this.agent = agent;
        this.embedding_model = embedding_model;
        this.skill_docs_embeddings = {};
        this.skill_docs = null;
    }
    async initSkillLibrary() {
        const skillDocs = getSkillDocs();
        this.skill_docs = skillDocs;
        if (this.embedding_model) {
            try {
                const embeddingPromises = skillDocs.map((doc) => {
                    return (async () => {
                        let func_name_desc = doc.split('\n').slice(0, 2).join('');
                        this.skill_docs_embeddings[doc] = await this.embedding_model.embed(func_name_desc);
                    })();
                });
                await Promise.all(embeddingPromises);
            } catch (error) {
                console.warn('Error with embedding model, using word-overlap instead.');
                this.embedding_model = null;
            }
        }
    }

    async getAllSkillDocs() {
        return this.skill_docs;
    }

    async getRelevantSkillDocs(message, select_num) {
        if(!message) // use filler message if none is provided
            message = '(no message)';
        let skill_doc_similarities = [];
        if (!this.embedding_model) {
            skill_doc_similarities = Object.keys(this.skill_docs)
                .map(doc_key => ({
                    doc_key,
                    similarity_score: wordOverlapScore(message, this.skill_docs[doc_key])
                }))
                .sort((a, b) => b.similarity_score - a.similarity_score);
        }
        else {
            let latest_message_embedding = '';
            skill_doc_similarities = Object.keys(this.skill_docs_embeddings)
            .map(doc_key => ({
                doc_key,
                similarity_score: cosineSimilarity(latest_message_embedding, this.skill_docs_embeddings[doc_key])
            }))
            .sort((a, b) => b.similarity_score - a.similarity_score);
        }

        let length = skill_doc_similarities.length;
        if (typeof select_num !== 'number' || isNaN(select_num) || select_num < 0) {
            select_num = length;
        } else {
            select_num = Math.min(Math.floor(select_num), length);
        }
        let selected_docs = skill_doc_similarities.slice(0, select_num);
        let relevant_skill_docs = '#### RELEVENT DOCS INFO ###\nThe following functions are listed in descending order of relevance.\n';
        relevant_skill_docs += 'SkillDocs:\n'
        relevant_skill_docs += selected_docs.map(doc => `${doc.doc_key}`).join('\n### ');
        return relevant_skill_docs;
    }
}
