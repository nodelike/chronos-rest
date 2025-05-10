import sharp from "sharp";
import logger from "./logger.js";

export const generateThumbnail = async (buffer, width = 300, height = 300) => {
    try {
        const thumbnail = await sharp(buffer)
            .resize({
                width,
                height,
                fit: "inside",
                withoutEnlargement: true,
            })
            .toBuffer();

        return thumbnail;
    } catch (error) {
        logger.error("Error generating thumbnail:", error);
        throw error;
    }
};

export const processImageFormat = async (buffer) => {
    try {
        // Get metadata to determine format and alpha channel presence
        const metadata = await sharp(buffer).metadata();

        // If already JPG or PNG, return the original buffer with the format
        if (metadata.format === "jpeg" || metadata.format === "jpg") {
            return { buffer, format: "jpeg", contentType: "image/jpeg" };
        }

        if (metadata.format === "png") {
            return { buffer: buffer, format: "png", contentType: "image/png" };
        }

        // For other formats, check for alpha channel
        let outputBuffer;
        let outputFormat;
        let contentType;

        if (metadata.hasAlpha) {
            // Convert to PNG if alpha channel is present
            outputBuffer = await sharp(buffer).png().toBuffer();
            outputFormat = "png";
            contentType = "image/png";
        } else {
            // Convert to JPEG if no alpha channel
            outputBuffer = await sharp(buffer).jpeg().toBuffer();
            outputFormat = "jpeg";
            contentType = "image/jpeg";
        }

        return { buffer: outputBuffer, format: outputFormat, contentType };
    } catch (error) {
        logger.error("Error processing image format:", error);
        throw error;
    }
};

export default {
    generateThumbnail,
    processImageFormat,
};
