import { readFileSync } from 'fs';
const settings = JSON.parse(readFileSync('./settings.json', 'utf8'));
export default settings;