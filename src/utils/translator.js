import translate from 'google-translate-api-x';
import settings from '../../settings.js';

const preferred_lang = settings.language;

export async function handleTranslation(message) {
    try {
        // Return original message if translation is disabled or set to English
        if (!preferred_lang || preferred_lang.toLowerCase() === 'en' || preferred_lang.toLowerCase() === 'english') {
            return message;
        } else {
            const lang = String(preferred_lang);
            const translation = await translate(message, { to: lang });
            return translation.text || message;
        }
    } catch (error) {
        console.error('Error translating message:', error);
        return message;
    }
}

export async function handleEnglishTranslation(message) {
    try {
        // Return original message if translation is disabled
        if (!preferred_lang) {
            return message;
        }
        const translation = await translate(message, { to: 'english' });
        return translation.text || message;
    } catch (error) {
        console.error('Error translating message:', error);
        return message;
    }
}
