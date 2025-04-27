import sharp from "sharp";
import logger from "./logger.js";

export const generateThumbnail = async (buffer, width = 300, height = 300) => {
    try {
        const thumbnail = await sharp(buffer)
            .resize({
                width,
                height,
                fit: 'inside',
                withoutEnlargement: true
            })
            .toBuffer();
        
        return thumbnail;
    } catch (error) {
        logger.error("Error generating thumbnail:", error);
        throw error;
    }
};

export default {
    generateThumbnail
}; 