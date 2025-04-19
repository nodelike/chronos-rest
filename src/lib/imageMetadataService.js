import sharp from "sharp";
import logger from "./logger.js";

export const extractImageMetadata = async (buffer) => {
    try {
        const metadata = await sharp(buffer).metadata();
        
        let exifData = {};
        if (metadata.exif) {
            const gpsInfo = extractGpsData(metadata.exif);
            if (gpsInfo) {
                exifData.gps = gpsInfo;
            }
            
            exifData.raw = metadata.exif;
        }
        
        return {
            format: metadata.format,
            width: metadata.width,
            height: metadata.height,
            space: metadata.space,
            channels: metadata.channels,
            depth: metadata.depth,
            density: metadata.density,
            hasAlpha: metadata.hasAlpha,
            hasProfile: metadata.hasProfile,
            orientation: metadata.orientation,
            exif: exifData
        };
    } catch (error) {
        logger.error("Error extracting image metadata:", error);
        return {};
    }
};

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

const extractGpsData = (exifBuffer) => {
    // This is a simplistic approach - a proper implementation would use
    // a library like exifReader to properly parse all EXIF data
    
    // For now, return null as we'll handle this with a proper library later
    return null;
};

export default {
    extractImageMetadata,
    generateThumbnail
}; 