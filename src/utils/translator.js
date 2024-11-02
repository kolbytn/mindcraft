import translate from 'google-translate-api-x';
import settings from '../../settings.js';

const preferred_lang = String(settings.language);

export async function handleTranslation(message) {
    if (preferred_lang.toLowerCase() === 'en' || preferred_lang.toLowerCase() === 'english')
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
    if (preferred_lang.toLowerCase() === 'en' || preferred_lang.toLowerCase() === 'english')
        return message;
    try {
        const translation = await translate(message, { to: 'english' });
        return translation.text || message;
    } catch (error) {
        console.error('Error translating message:', error);
        return message;
    }
}
