import type { EventHandler } from 'svelte/elements';

export const handleCredentialImageLoadFail: EventHandler = (event) => {
    (event.currentTarget as HTMLImageElement).src = '/credential-background-placeholder-vert.png';
};

export const isImageURLValid = async (url?: string) => {
    if (!url) {
        return false;
    }

    const response = await fetch(url);
    if (response.status >= 400) {
        return false;
    }

    const buf = await response.blob();
    const ok = buf.type.startsWith('image/');
    return ok
};
