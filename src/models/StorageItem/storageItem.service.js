import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { uploadFile, deleteFile, extractKeyFromUri, replaceWithPresignedUrls } from "../../lib/s3Service.js";
import { extractImageMetadata, generateThumbnail } from "../../lib/imageMetadataService.js";
import { publishEnrichmentEvent } from "../../lib/eventBridgeClient.js";

export const createStorageItem = async (buffer, fileInfo, userId) => {
    try {
        const { originalname, mimetype, size } = fileInfo;

        const type = determineItemType(mimetype);

        const s3Result = await uploadFile(buffer, originalname, mimetype, type.toLowerCase());

        let rawMeta = {};

        if (type === "PHOTO") {
            rawMeta = await extractImageMetadata(buffer);
            if (Object.keys(rawMeta).length > 0) {
                try {
                    const thumbnail = await generateThumbnail(buffer);
                    const thumbnailResult = await uploadFile(thumbnail, `thumb_${originalname}`, mimetype, "thumbnails");
                    rawMeta.thumbnail = thumbnailResult.url;
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
                source: "MANUAL",
                collectorType: "MANUAL",
                userId,
                rawMeta,
                processedAt: null,
            },
        });

        // Send enrichment event to EventBridge for processing
        const fileTypes = ["PHOTO", "VIDEO", "AUDIO", "DOCUMENT"];
        if (fileTypes.includes(type)) {
            const mediaType = type.toLowerCase();

            try {
                const publishResult = await publishEnrichmentEvent(storageItem.id, mediaType, s3Result.bucket, s3Result.key, {
                    mimeType: mimetype,
                    fileName: originalname,
                    fileSize: size,
                    // Include basic extracted metadata
                    ...rawMeta,
                });

                if (publishResult) {
                    logger.info(`Queued item ${storageItem.id} for enrichment processing via EventBridge`);
                } else {
                    logger.warn(`Failed to queue enrichment for item ${storageItem.id}`);
                }
            } catch (err) {
                // Don't fail the upload if the enrichment job fails to queue
                logger.error(`Failed to queue enrichment job for item ${storageItem.id}:`, err);
            }
        }

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
        throw error;
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
                // Search in rawMeta JSON fields
                {
                    rawMeta: {
                        path: ["title"],
                        string_contains: keyword,
                    },
                },
                {
                    rawMeta: {
                        path: ["content"],
                        string_contains: keyword,
                    },
                },
                // Include URIs for link type items
                { uri: { contains: keyword, mode: "insensitive" } },
            ];
        }

        const totalCount = await prisma.storageItem.count({ where });

        const items = await prisma.storageItem.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
                // Include the consolidated metadata and related models
                mediaMeta: true,
                face: {
                    include: {
                        person: true,
                    },
                },
                socialMetas: {
                    include: {
                        authorProfile: true,
                    },
                },
            },
        });

        // Add presigned URLs to all items and their thumbnails
        const itemsWithPresignedUrls = await Promise.all(items.map((item) => replaceWithPresignedUrls(item)));

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
        throw error; // Throw the error instead of returning an error object
    }
};

export const deleteStorageItem = async (id, userId) => {
    try {
        const storageItem = await prisma.storageItem.findUnique({
            where: { id },
            include: {
                face: true,
                socialMetas: true,
                mediaMeta: true,
            },
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
            if (storageItem.rawMeta && storageItem.rawMeta.thumbnail) {
                const thumbnailKey = extractKeyFromUri(storageItem.rawMeta.thumbnail);
                if (thumbnailKey) {
                    await deleteFile(thumbnailKey);
                }
            }
        }

        // Delete related face detections
        if (storageItem.face && storageItem.face.length > 0) {
            await prisma.face.deleteMany({
                where: {
                    storageItemId: id,
                },
            });
        }

        // With PostgreSQL, we no longer need to manually handle the many-to-many relationship
        // Just disconnect the relationships by updating the socialMetas
        if (storageItem.socialMetas && storageItem.socialMetas.length > 0) {
            // This will automatically handle the junction table
            for (const socialMeta of storageItem.socialMetas) {
                await prisma.socialMeta.update({
                    where: { id: socialMeta.id },
                    data: {
                        attachments: {
                            disconnect: { id },
                        },
                    },
                });
            }
        }

        // Delete all associated media metadata
        if (storageItem.mediaMeta && storageItem.mediaMeta.length > 0) {
            await prisma.mediaMeta.deleteMany({
                where: { itemId: id },
            });
        }

        await prisma.storageItem.delete({
            where: { id },
        });

        return { success: true, message: "Storage item deleted successfully" };
    } catch (error) {
        logger.error(`Error deleting storage item ${id}:`, error);
        throw error;
    }
};

export const createNonFileStorageItem = async (itemData) => {
    try {
        const { type, title, content, url, metadata, userId } = itemData;

        let fileName = title || "Untitled";
        let mimeType = "application/json";
        let fileSize = 0;

        let uri = url || "";

        let rawMeta = {
            ...metadata,
            title,
            content,
        };

        let storageItem;

        if (type === "LOCATION" && metadata && metadata.lat && metadata.lng) {
            const geoMeta = await prisma.geoMeta.create({
                data: {
                    lat: parseFloat(metadata.lat),
                    lng: parseFloat(metadata.lng),
                    place: metadata.place || null,
                },
            });

            storageItem = await prisma.storageItem.create({
                data: {
                    uri,
                    fileName,
                    fileSize,
                    mimeType,
                    type,
                    source: "MANUAL_INPUT",
                    collectorType: "MANUAL",
                    userId,
                    rawMeta,
                    geoMetaId: geoMeta.id,
                    processedAt: null,
                },
            });
        } else {
            storageItem = await prisma.storageItem.create({
                data: {
                    uri,
                    fileName,
                    fileSize,
                    mimeType,
                    type,
                    source: "MANUAL_INPUT",
                    collectorType: "MANUAL",
                    userId,
                    rawMeta,
                    processedAt: null,
                },
            });
        }

        // Queue appropriate non-file items for enrichment
        if (type === "LINK" && uri) {
            try {
                // For links, we don't have S3 keys, so we pass the URI in metadata
                await publishEnrichmentEvent(storageItem.id, "link", null, null, {
                    uri: uri,
                    ...rawMeta,
                });
                logger.info(`Queued non-file item ${storageItem.id} of type ${type} for enrichment`);
            } catch (err) {
                logger.error(`Failed to queue enrichment job for non-file item ${storageItem.id}:`, err);
            }
        } else if (type === "SOCIAL_MEDIA" && metadata?.platform) {
            try {
                await publishEnrichmentEvent(storageItem.id, "social_media", null, null, {
                    platform: metadata.platform,
                    uri: uri,
                    ...rawMeta,
                });
                logger.info(`Queued social media item ${storageItem.id} for enrichment`);
            } catch (err) {
                logger.error(`Failed to queue enrichment job for social media item ${storageItem.id}:`, err);
            }
        }

        if (storageItem) {
            return storageItem;
        }
        
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
    createNonFileStorageItem,
};
