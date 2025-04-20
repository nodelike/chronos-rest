import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { uploadFile, deleteFile, getPresignedUrl, extractKeyFromUri, replaceWithPresignedUrls } from "../../lib/s3Service.js";
import { extractImageMetadata, generateThumbnail } from "../../lib/imageMetadataService.js";

export const createStorageItem = async (buffer, fileInfo, userId) => {
    try {
        const { originalname, mimetype, size } = fileInfo;

        const type = determineItemType(mimetype);

        const s3Result = await uploadFile(buffer, originalname, mimetype, type.toLowerCase());

        let rawMetadata = {};

        if (type === "PHOTO") {
            rawMetadata = await extractImageMetadata(buffer);
            if (Object.keys(rawMetadata).length > 0) {
                try {
                    const thumbnail = await generateThumbnail(buffer);
                    const thumbnailResult = await uploadFile(thumbnail, `thumb_${originalname}`, mimetype, "thumbnails");
                    rawMetadata.thumbnail = thumbnailResult.url;
                } catch (error) {
                    logger.warn("Failed to generate thumbnail:", error);
                }
            }
        }

        const storageItem = await prisma.storageItem.create({
            data: {
                uri: s3Result.url,
                fileName: originalname,
                fileSize: size,
                mimeType: mimetype,
                type,
                source: "MANUAL_UPLOAD",
                collectorType: "MANUAL",
                userId,
                rawMetadata,
                processedAt: null,
            },
        });

        return storageItem;
    } catch (error) {
        logger.error("Error creating storage item:", error);
        throw error;
    }
};

export const getStorageItemById = async (id) => {
    try {
        const item = await prisma.storageItem.findUnique({
            where: { id },
        });
        
        if (!item) return null;
        
        return await replaceWithPresignedUrls(item);
    } catch (error) {
        logger.error(`Error getting storage item ${id}:`, error);
        return null;
    }
};

export const getStorageItems = async (options = {}) => {
    try {
        const { page = 1, limit = 20, type, userId, source, startDate, endDate, keyword } = options;

        const skip = (page - 1) * limit;

        const where = {};

        if (type) where.type = type;
        if (userId) where.userId = userId;
        if (source) where.source = source;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // Enhanced keyword search for both file and non-file items
        if (keyword) {
            where.OR = [
                { fileName: { contains: keyword, mode: "insensitive" } },
                // Search in rawMetadata JSON fields
                {
                    rawMetadata: {
                        path: ["title"],
                        string_contains: keyword
                    }
                },
                {
                    rawMetadata: {
                        path: ["content"],
                        string_contains: keyword
                    }
                },
                // Include URIs for link type items
                { uri: { contains: keyword, mode: "insensitive" } }
            ];
        }
        
        const totalCount = await prisma.storageItem.count({ where });

        const items = await prisma.storageItem.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
                // Include related metadata for richer search results
                geoMeta: true,
                ocrMeta: true,
                faceMeta: true,
                transcriptMeta: true,
                keywordMeta: true,
                socialMeta: true
            }
        });
        
        // Add presigned URLs to all items and their thumbnails
        const itemsWithPresignedUrls = await Promise.all(
            items.map(item => replaceWithPresignedUrls(item))
        );

        return {
            items: itemsWithPresignedUrls,
            metadata: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
            },
        };
    } catch (error) {
        logger.error("Error getting storage items:", error);
        throw error;
    }
};

export const deleteStorageItem = async (id, userId) => {
    try {
        const storageItem = await prisma.storageItem.findUnique({
            where: { id },
        });

        if (!storageItem) {
            return { success: false, message: "Storage item not found" };
        }

        if (storageItem.userId !== userId) {
            return { success: false, message: "You don't have permission to delete this item" };
        }

        // Only delete files for file-based types (PHOTO, VIDEO, AUDIO, DOCUMENT)
        // Non-file types like EVENT, NOTE, LOCATION don't have files to delete
        const fileBasedTypes = ["PHOTO", "VIDEO", "AUDIO", "DOCUMENT"];
        
        if (fileBasedTypes.includes(storageItem.type) && storageItem.uri) {
            const key = extractKeyFromUri(storageItem.uri);
            if (key) {
                await deleteFile(key);
            }
            
            // Delete thumbnail if it exists
            if (storageItem.rawMetadata && storageItem.rawMetadata.thumbnail) {
                const thumbnailKey = extractKeyFromUri(storageItem.rawMetadata.thumbnail);
                if (thumbnailKey) {
                    await deleteFile(thumbnailKey);
                }
            }
        }

        if (storageItem.geoMetaId) {
            await prisma.geoMeta.delete({
                where: { id: storageItem.geoMetaId }
            });
        }

        if (storageItem.ocrMetaId) {
            await prisma.ocrMeta.delete({
                where: { id: storageItem.ocrMetaId }
            });
        }

        if (storageItem.faceMetaId) {
            await prisma.faceMeta.delete({
                where: { id: storageItem.faceMetaId }
            });
        }

        if (storageItem.transcriptMetaId) {
            await prisma.transcriptMeta.delete({
                where: { id: storageItem.transcriptMetaId }
            });
        }

        if (storageItem.keywordMetaId) {
            await prisma.keywordMeta.delete({
                where: { id: storageItem.keywordMetaId }
            });
        }

        if (storageItem.socialMetaId) {
            await prisma.socialMeta.delete({
                where: { id: storageItem.socialMetaId }
            });
        }

        await prisma.storageItem.delete({
            where: { id },
        });

        return { success: true, message: "Storage item deleted successfully" };
    } catch (error) {
        logger.error(`Error deleting storage item ${id}:`, error);
        return { success: false, message: "Error deleting storage item" };
    }
};

export const createNonFileStorageItem = async (itemData) => {
    try {
        const { type, title, content, url, metadata, userId } = itemData;
        
        let fileName = title || "Untitled";
        let mimeType = "application/json";
        let fileSize = 0;
        
        let uri = url || "";
        
        let rawMetadata = { 
            ...metadata,
            title,
            content
        };
        
        if (type === "EVENT" && metadata) {
            if (metadata.startTime) rawMetadata.startTime = metadata.startTime;
            if (metadata.endTime) rawMetadata.endTime = metadata.endTime;
            if (metadata.location) rawMetadata.location = metadata.location;
        }
        
        if (type === "LOCATION" && metadata && metadata.lat && metadata.lng) {
            const geoMeta = await prisma.geoMeta.create({
                data: {
                    lat: parseFloat(metadata.lat),
                    lng: parseFloat(metadata.lng),
                    place: metadata.place || null
                }
            });
            
            const storageItem = await prisma.storageItem.create({
                data: {
                    uri,
                    fileName,
                    fileSize,
                    mimeType,
                    type,
                    source: "MANUAL_INPUT",
                    collectorType: "MANUAL",
                    userId,
                    rawMetadata,
                    geoMetaId: geoMeta.id,
                    processedAt: null,
                }
            });
            
            return storageItem;
        }
        
        const storageItem = await prisma.storageItem.create({
            data: {
                uri,
                fileName,
                fileSize,
                mimeType,
                type,
                source: "MANUAL_INPUT",
                collectorType: "MANUAL",
                userId,
                rawMetadata,
                processedAt: null,
            }
        });
        
        return storageItem;
    } catch (error) {
        logger.error("Error creating non-file storage item:", error);
        throw error;
    }
};

const determineItemType = (mimetype) => {
    if (mimetype.startsWith("image/")) return "PHOTO";
    if (mimetype.startsWith("video/")) return "VIDEO";
    if (mimetype.startsWith("audio/")) return "AUDIO";
    if (
        mimetype.includes("pdf") ||
        mimetype.includes("document") ||
        mimetype.includes("msword") ||
        mimetype.includes("excel") ||
        mimetype.includes("presentation")
    ) {
        return "DOCUMENT";
    }
    return "OTHER";
};

export default {
    createStorageItem,
    getStorageItemById,
    getStorageItems,
    deleteStorageItem,
    createNonFileStorageItem
};
