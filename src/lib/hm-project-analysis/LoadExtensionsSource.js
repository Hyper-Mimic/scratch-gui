
export async function LoadExtensionSource(url) {
    if (url.startsWith('data:')) {
        const match = url.match(/^data:([^,]+),(.+)$/);
        if (!match) throw new Error('[hm-Analysis] Invalid data URL: ' + url);
        const isBase64 = match[1].endsWith(';base64');
        const payload = match[2];
        if (isBase64) {
            const binary = atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        }
        return decodeURIComponent(payload);
    }

    const resolvedUrl = /^https?:/.test(url) ? url : new URL(url, location.href).href;
    const response = await fetch(resolvedUrl);
    if (!response.ok) throw new Error('[hm-Analysis] Failed to fetch extension source: ' + response.status);
    return await response.text();
}

export default LoadExtensionSource;