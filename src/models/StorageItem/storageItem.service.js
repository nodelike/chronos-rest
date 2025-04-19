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
                processedAt: new Date(),
            },
        });

        logger.info(`Created storage item: ${storageItem.id}`);

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
        
        // Add presigned URLs for the item and its thumbnail
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

        // Keyword search (simple implementation) - need to improve
        if (keyword) {
            where.OR = [{ fileName: { contains: keyword, mode: "insensitive" } }];
        }
        const totalCount = await prisma.storageItem.count({ where });

        const items = await prisma.storageItem.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
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
        // Get the storage item
        const storageItem = await prisma.storageItem.findUnique({
            where: { id },
        });

        if (!storageItem) {
            return { success: false, message: "Storage item not found" };
        }

        // Check if the user owns the item
        if (storageItem.userId !== userId) {
            return { success: false, message: "You don't have permission to delete this item" };
        }

        // Extract the key from the URI
        const key = extractKeyFromUri(storageItem.uri);

        // Delete the file from S3
        await deleteFile(key);

        // Delete thumbnail if it exists
        if (storageItem.rawMetadata && storageItem.rawMetadata.thumbnail) {
            const thumbnailKey = extractKeyFromUri(storageItem.rawMetadata.thumbnail);
            if (thumbnailKey) {
                await deleteFile(thumbnailKey);
            }
        }

        // Delete from database
        await prisma.storageItem.delete({
            where: { id },
        });

        logger.info(`Deleted storage item: ${id}`);

        return { success: true, message: "Storage item deleted successfully" };
    } catch (error) {
        logger.error(`Error deleting storage item ${id}:`, error);
        return { success: false, message: "Error deleting storage item" };
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
};
