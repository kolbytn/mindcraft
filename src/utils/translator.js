import translate from 'google-translate-api-x';
import settings from '../agent/settings.js';



export async function handleTranslation(message) {
    let preferred_lang = String(settings.language).toLowerCase();
    if (!preferred_lang || preferred_lang === 'en' || preferred_lang === 'english')
        return message;
    try {
        const translation = await translate(message, { to: preferred_lang });
        return translation.text || message;
    } catch (error) {
        console.error('Error translating message:', error);
        return message;
    }
}

export async function handleEnglishTranslation(message) {
    let preferred_lang = String(settings.language).toLowerCase();
    if (!preferred_lang || preferred_lang === 'en' || preferred_lang === 'english')
        return message;
    try {
        const translation = await translate(message, { to: 'english' });
        return translation.text || message;
    } catch (error) {
        console.error('Error translating message:', error);
        return message;
    }
}
