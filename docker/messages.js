// Serialization utilities
export function serialize(message) {
    return JSON.stringify(message) + '\n';
}
export function parseOutboundLine(line) {
    try {
        const parsed = JSON.parse(line);
        if (parsed &&
            typeof parsed === 'object' &&
            typeof parsed.type === 'string' &&
            ['thinking', 'tool_use', 'question', 'result', 'error'].includes(parsed.type)) {
            return parsed;
        }
        return null;
    }
    catch {
        return null;
    }
}
export function parseInboundLine(line) {
    try {
        const parsed = JSON.parse(line);
        if (parsed &&
            typeof parsed === 'object' &&
            typeof parsed.type === 'string' &&
            ['prompt', 'answer'].includes(parsed.type)) {
            return parsed;
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=messages.js.map