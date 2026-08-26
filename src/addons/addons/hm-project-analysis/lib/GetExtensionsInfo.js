
export function GetExtensionsInfo(source) {
    
    // 解析翻译数据
    function parseTranslationData(source) {
        const match = source.match(/Scratch\.translate\.setup\((\{[\s\S]*?\})\)\s*;?/);
        if (!match) return null;
        try { return JSON.parse(match[1]); } catch (e) { return null; }
    }

    // 解析 getInfo 函数
    function parseGetInfo(source) {
        const match = source.match(/getInfo\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/);
        let body = '';
        if (match && match[1]) {
            body = match[1];
            body = body.replace(/^\s*return\s*\{/, '').replace(/\}\s*;\s*$/, '').trim();
        }
        try {
            let name = null;
            let nameType = null;
            let nameKey = null;

            const translateMatch = body.match(/name\s*:\s*Scratch\.translate\(\s*(['"])(.*?)\1\s*\)/);
            if (translateMatch) {
                nameType = 'translate';
                nameKey = translateMatch[2];
            } else {
                const stringMatch = body.match(/name\s*:\s*(['"])(.*?)\1/);
                if (stringMatch) {
                    nameType = 'string';
                    name = stringMatch[2];
                }
            }
            
            const colorMatch = body.match(/color1\s*:\s*(['"])([^'"]+)\1/);
            let color = '#0fbd8c';
            if (colorMatch) {
                color = colorMatch[2];
            }
            
            const idMatch = body.match(/id\s*:\s*(['"])([^'"]+)\1/);
            let id = null;
            if (idMatch) {
                id = idMatch[2];
            }

            body = body.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '').trim();
            body = body.split('\n').map(line => line.replace(/^\s+/, '')).join('\n');

            const ToplevelBlockOPs = (function () { 
                const result = []; 
                const blockRegex = /\{\s*opcode:\s*"([^"]+)",\s*blockType:\s*Scratch\.BlockType\.(\w+)/g; 
                let match; 
                while ((match = blockRegex.exec(body)) !== null) { 
                    const opcode = match[1]; 
                    const blockType = match[2]; 
                    if (blockType === 'EVENT' || blockType === 'HAT') { 
                        result.push(id + '_' + opcode); 
                    } 
                } 
                return result; 
            })();

            const MenuOPs = (function () { 
                const result = []; 
                const lines = body.split('\n'); 
                let menuStartLine = -1; 
                for (let i = 0; i < lines.length; i++) { 
                    if (/^\s*menus:/.test(lines[i])) { 
                        menuStartLine = i; 
                        break; 
                    } 
                } 
                if (menuStartLine === -1) return result; 
                for (let i = menuStartLine + 1; i < lines.length; i++) { 
                    const match = lines[i].match(/^\s*(\w+):\s*\{/); 
                    if (match) { 
                        result.push(id + '_menu_' + match[1]); 
                    } 
                } 
                return result; 
            })();

            return { name, nameType, nameKey, color, ToplevelBlockOPs, MenuOPs };
        } catch (e) {
            console.warn('[hm-Analysis] Failed to parseGetInfo:', e.message);
            return null;
        }
    }

    try {
        const translationData = parseTranslationData(source);
        // Read the editor locale defensively (the flag stores state under scratchGui.locales.locale,
        // but fall back to other shapes / defaults so this never throws if ReduxStore is unavailable).
        let locale = 'en';
        try {
            const rs = (typeof window !== 'undefined' && window.ReduxStore && window.ReduxStore.getState)
                ? window.ReduxStore.getState()
                : {};
            locale = (rs.scratchGui && rs.scratchGui.locales && rs.scratchGui.locales.locale) ||
                (rs.locales && rs.locales.locale) ||
                'en';
        } catch (localeErr) {
            locale = 'en';
        }
        const transMap = translationData?.[locale];
        const info = parseGetInfo(source);
        if (!info) {
            return { name: null, color: null, ToplevelBlockOPs: null, MenuOPs: null };
        }

        let displayName = null;
        if (info.nameType === 'translate' && info.nameKey) {
            displayName = transMap?.['_' + info.nameKey] || transMap?.[info.nameKey] || info.nameKey;
        } else if (info.nameType === 'string') {
            displayName = info.name;
        }
        return {defaultName: info.nameKey, name: displayName, color: info.color, ToplevelBlockOPs: info.ToplevelBlockOPs, MenuOPs: info.MenuOPs };
    } catch (e) {
        console.warn('[hm-Analysis] Failed to GetExtensionsInfo :', e.message);
        return { name: null, color: null, ToplevelBlockOPs: null, MenuOPs: null };
    }
}

export default GetExtensionsInfo;