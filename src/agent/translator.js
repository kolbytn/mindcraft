import translate from 'google-translate-api-x';
import settings from '../../settings.js'; 


const preferred_lang = settings.language;


export async function handleTranslation(message) {
    try {
        if (preferred_lang.toLowerCase() === 'en' || preferred_lang.toLowerCase() === 'english') {
            return message;
        } else {
            const lang = String(preferred_lang); // Ensure lang is a string

            const translation = await translate(message, { to: lang });
            return translation.text || message; // Ensure translation.text is a string
        }
    } catch (error) {
        console.error('Error translating message:', error);
        return message; // Fallback to the original message if translation fails
    }
}

export async function handleEnglishTranslation(message) {
    try {
        const translation = await translate(message, { to: 'english' });
        return translation.text || message; // Ensures translation.text is a string
    } catch (error) {
        console.error('Error translating message:', error);
        return message; // Fallback to the original message if translation fails
    }
}
