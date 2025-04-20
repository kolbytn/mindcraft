
function isObject(variable) {
    return typeof variable === 'object' && variable!== null && !Array.isArray(variable);
}

export function splitContentAndJSON(text) {
    let content = text;
    let data = {};
    const mark_pos = [];
    const regex = /```/g;
    let match;

    while ((match = regex.exec(text))!== null) {
        mark_pos.push(match.index);
    }

    for (let i = 0; i < mark_pos.length - 1; i++) {
        const data_start = mark_pos[i];
        const data_end = mark_pos[i + 1];
        try {
            let json_text = text.slice(data_start + 3, data_end)
              .replace(/\n/g, "")
              .replace(/\r/g, "")
              .trim();
            const start = json_text.indexOf("{");
            if (json_text.length > 0 && json_text[0]!== "{" && start >= 0) {
                json_text = json_text.slice(start);
            }
            data = JSON.parse(json_text);
            content = (text.slice(0, data_start).trim() + "\n" + text.slice(Math.min(text.length, data_end + 3)).trim()).trim();
        } catch (e) {
            content = text;
            data = {};
        }
        if (isObject(data)) {
            break;
        }
    }
    return [content, data];
}
