import sharp from "sharp";

export function getBoundingBoxDimensions(boundingBox) {
    if (boundingBox.Width !== undefined) {
        return {
            width: boundingBox.Width * 100,
            height: boundingBox.Height * 100,
            left: boundingBox.Left * 100,
            top: boundingBox.Top * 100,
        };
    }
    return boundingBox;
}

export async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export const thumbnailFromImage = async (imageBuffer, boundingBox) => {
    const { width, height, left, top } = getBoundingBoxDimensions(boundingBox);
    const thumbnailBuffer = await sharp(imageBuffer)
        .extract({
            left: Math.floor(left),
            top: Math.floor(top),
            width: Math.floor(width),
            height: Math.floor(height),
        })
        .resize(200, 200, {
            fit: "cover",
            position: "center",
        })
        .toBuffer();

    return thumbnailBuffer;
};
