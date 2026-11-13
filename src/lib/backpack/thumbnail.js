/**
 * Rasterise a data-url picture into a PNG thumbnail.
 * @param {string} dataUrl the picture to convert
 * @param {number} [maxDimensionSize] longest side of the result, in pixels
 * @returns {Promise<string>} base64 PNG, without the data-url prefix
 */
const jpegThumbnail = (dataUrl, maxDimensionSize) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 3x the maximum displayed size of 32px -- which is what a sprite tile shows. A code item is
        // not bound by that: its picture is a whole group of stacks, and a flat group is mostly
        // width, so at 96px the short side collapses to a sliver (see the ghost sizing in
        // components/drag-layer). Callers that show their thumbnail larger pass their own size.
        const maxDimension = maxDimensionSize || 96;

        // TW: After setting canvas width/height, the canvas is automatically cleared.

        if (image.height < 1 || image.width < 1) {
            canvas.width = canvas.height = maxDimension;
            // drawImage can fail if image height/width is less than 1
            // Use blank image; the costume is too small to render anyway
        } else {
            if (image.height > image.width) {
                canvas.height = maxDimension;
                canvas.width = (maxDimension / image.height) * image.width;
            } else {
                canvas.width = maxDimension;
                canvas.height = (maxDimension / image.width) * image.height;
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        }

        // TW: PNG allows using transparency while JPEG does not.
        // A white background looks quite ugly in dark mode.
        const dataURL = canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
        resolve(dataURL);
    };
    image.onerror = err => {
        reject(err);
    };
    image.src = dataUrl;
});

export default jpegThumbnail;
