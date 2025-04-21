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

        // Send enrichment event to EventBridge for processing
        const fileTypes = ["PHOTO", "VIDEO", "AUDIO", "DOCUMENT"];
        if (fileTypes.includes(type)) {
            const mediaType = type.toLowerCase();
            
            try {
                const publishResult = await publishEnrichmentEvent(
                    storageItem.id,
                    mediaType,
                    s3Result.bucket,
                    s3Result.key,
                    {
                        mimeType: mimetype,
                        fileName: originalname,
                        fileSize: size,
                        // Include basic extracted metadata
                        ...rawMetadata,
                    }
                );
                
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
                        string_contains: keyword,
                    },
                },
                {
                    rawMetadata: {
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
                // Include related metadata for richer search results
                geoMeta: true,
                ocrMeta: true,
                faceDetections: {
                    include: {
                        person: true,
                    },
                },
                transcriptMeta: true,
                keywordMeta: true,
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
        throw error;
    }
};

export const deleteStorageItem = async (id, userId) => {
    try {
        const storageItem = await prisma.storageItem.findUnique({
            where: { id },
            include: {
                faceDetections: true,
                socialMetas: true,
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
            if (storageItem.rawMetadata && storageItem.rawMetadata.thumbnail) {
                const thumbnailKey = extractKeyFromUri(storageItem.rawMetadata.thumbnail);
                if (thumbnailKey) {
                    await deleteFile(thumbnailKey);
                }
            }
        }

        // Delete related face detections
        if (storageItem.faceDetections && storageItem.faceDetections.length > 0) {
            await prisma.faceDetection.deleteMany({
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

        if (storageItem.geoMetaId) {
            await prisma.geoMeta.delete({
                where: { id: storageItem.geoMetaId },
            });
        }

        if (storageItem.ocrMetaId) {
            await prisma.ocrMeta.delete({
                where: { id: storageItem.ocrMetaId },
            });
        }

        if (storageItem.transcriptMetaId) {
            await prisma.transcriptMeta.delete({
                where: { id: storageItem.transcriptMetaId },
            });
        }

        if (storageItem.keywordMetaId) {
            await prisma.keywordMeta.delete({
                where: { id: storageItem.keywordMetaId },
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
                    rawMetadata,
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
                    rawMetadata,
                    processedAt: null,
                },
            });
        }

        // Queue appropriate non-file items for enrichment
        if (type === "LINK" && uri) {
            try {
                // For links, we don't have S3 keys, so we pass the URI in metadata
                await publishEnrichmentEvent(
                    storageItem.id,
                    "link",
                    null,
                    null,
                    {
                        uri: uri,
                        ...rawMetadata
                    }
                );
                logger.info(`Queued non-file item ${storageItem.id} of type ${type} for enrichment`);
            } catch (err) {
                logger.error(`Failed to queue enrichment job for non-file item ${storageItem.id}:`, err);
            }
        } else if (type === "SOCIAL_MEDIA" && metadata?.platform) {
            try {
                await publishEnrichmentEvent(
                    storageItem.id,
                    "social_media",
                    null,
                    null,
                    {
                        platform: metadata.platform,
                        uri: uri,
                        ...rawMetadata
                    }
                );
                logger.info(`Queued social media item ${storageItem.id} for enrichment`);
            } catch (err) {
                logger.error(`Failed to queue enrichment job for social media item ${storageItem.id}:`, err);
            }
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

export const updateEnrichmentData = async (id, data) => {
    try {
        const storageItem = await prisma.storageItem.findUnique({
            where: { id },
        });

        if (!storageItem) {
            return { success: false, message: "Storage item not found" };
        }

        const updates = {
            processedAt: new Date(),
        };

        // Store all raw AWS responses in the StorageItem's rawMetadata
        updates.rawMetadata = {
            ...(storageItem.rawMetadata || {}),
            ...(data?.rekognitionMeta && { rekognition: data.rekognitionMeta }),
            ...(data?.ocrData?.rawResponse && { textract: data.ocrData.rawResponse }),
            ...(data?.labelData?.rawResponse && { labels: data.labelData.rawResponse }),
            ...(data?.moderationData?.rawResponse && { moderation: data.moderationData.rawResponse }),
            ...(data?.celebrityData?.rawResponse && { celebrities: data.celebrityData.rawResponse }),
            ...(data?.customLabelData?.rawResponse && { customLabels: data.customLabelData.rawResponse })
        };

        if (data?.geoData) {
            let geoMeta;
            if (storageItem.geoMetaId) {
                geoMeta = await prisma.geoMeta.update({
                    where: { id: storageItem.geoMetaId },
                    data: {
                        lat: data.geoData.lat,
                        lng: data.geoData.lng,
                        place: data.geoData.place || null,
                    },
                });
            } else {
                geoMeta = await prisma.geoMeta.create({
                    data: {
                        lat: data.geoData.lat,
                        lng: data.geoData.lng,
                        place: data.geoData.place || null,
                    },
                });
            }
            updates.geoMetaId = geoMeta.id;
        }

        if (data?.ocrData) {
            let ocrMeta;
            if (storageItem.ocrMetaId) {
                // Store raw AWS Textract response with minimal processing
                ocrMeta = await prisma.ocrMeta.update({
                    where: { id: storageItem.ocrMetaId },
                    data: {
                        // Extract just the text for the text field
                        text: data.ocrData.text || extractTextFromRawResponse(data.ocrData.rawResponse),
                        language: data.ocrData.language || null,
                        // Store the complete raw response for future use
                        rawMetadata: data.ocrData.rawResponse || data.ocrData.blocks || {},
                    },
                });
            } else {
                // Create with raw AWS Textract response
                ocrMeta = await prisma.ocrMeta.create({
                    data: {
                        text: data.ocrData.text || extractTextFromRawResponse(data.ocrData.rawResponse),
                        language: data.ocrData.language || null,
                        rawMetadata: data.ocrData.rawResponse || data.ocrData.blocks || {},
                    },
                });
            }
            
            updates.ocrMetaId = ocrMeta.id;
        }

        if (data?.transcriptData) {
            let transcriptMeta;
            if (storageItem.transcriptMetaId) {
                transcriptMeta = await prisma.transcriptMeta.update({
                    where: { id: storageItem.transcriptMetaId },
                    data: {
                        transcript: data.transcriptData.transcript,
                        language: data.transcriptData.language || null,
                    },
                });
            } else {
                transcriptMeta = await prisma.transcriptMeta.create({
                    data: {
                        transcript: data.transcriptData.transcript,
                        language: data.transcriptData.language || null,
                    },
                });
            }
            updates.transcriptMetaId = transcriptMeta.id;
        }

        if (data?.keywords) {
            let keywordMeta;
            if (storageItem.keywordMetaId) {
                keywordMeta = await prisma.keywordMeta.update({
                    where: { id: storageItem.keywordMetaId },
                    data: { keywords: data.keywords },
                });
            } else {
                keywordMeta = await prisma.keywordMeta.create({
                    data: { keywords: data.keywords },
                });
            }
            updates.keywordMetaId = keywordMeta.id;
        }

        // Handle AWS Rekognition Labels (objects, scenes, activities, etc.)
        if (data?.labelData && (data.labelData.labels || data.labelData.rawResponse)) {
            let labelMeta;
            if (storageItem.labelMetaId) {
                // If raw response is provided, store it directly
                labelMeta = await prisma.labelMeta.update({
                    where: { id: storageItem.labelMetaId },
                    data: {
                        // If transformed labels are provided, use them, otherwise extract from raw response
                        labels: data.labelData.labels || extractLabelsFromRawResponse(data.labelData.rawResponse),
                        dominantColors: data.labelData.dominantColors || undefined,
                        imageQuality: data.labelData.imageQuality || undefined,
                        // Store raw response in rawMetadata
                        rawMetadata: data.labelData.rawResponse || undefined
                    },
                });
            } else {
                labelMeta = await prisma.labelMeta.create({
                    data: {
                        labels: data.labelData.labels || extractLabelsFromRawResponse(data.labelData.rawResponse),
                        dominantColors: data.labelData.dominantColors || undefined,
                        imageQuality: data.labelData.imageQuality || undefined,
                        rawMetadata: data.labelData.rawResponse || undefined
                    },
                });
            }
            updates.labelMetaId = labelMeta.id;
        }

        // Handle AWS Rekognition Custom Labels
        if (data?.customLabelData && (data.customLabelData.customLabels || data.customLabelData.rawResponse)) {
            let customLabelMeta;
            if (storageItem.customLabelMetaId) {
                customLabelMeta = await prisma.customLabelMeta.update({
                    where: { id: storageItem.customLabelMetaId },
                    data: {
                        customLabels: data.customLabelData.customLabels || extractCustomLabelsFromRawResponse(data.customLabelData.rawResponse),
                        modelVersion: data.customLabelData.modelVersion || undefined,
                        rawMetadata: data.customLabelData.rawResponse || undefined
                    },
                });
            } else {
                customLabelMeta = await prisma.customLabelMeta.create({
                    data: {
                        customLabels: data.customLabelData.customLabels || extractCustomLabelsFromRawResponse(data.customLabelData.rawResponse),
                        modelVersion: data.customLabelData.modelVersion || undefined,
                        rawMetadata: data.customLabelData.rawResponse || undefined
                    },
                });
            }
            updates.customLabelMetaId = customLabelMeta.id;
        }

        // Handle AWS Rekognition Content Moderation
        if (data?.moderationData && (data.moderationData.moderationLabels || data.moderationData.rawResponse)) {
            let contentModerationMeta;
            if (storageItem.contentModerationMetaId) {
                contentModerationMeta = await prisma.contentModerationMeta.update({
                    where: { id: storageItem.contentModerationMetaId },
                    data: {
                        moderationLabels: data.moderationData.moderationLabels || extractModerationLabelsFromRawResponse(data.moderationData.rawResponse),
                        moderationConfidence: data.moderationData.moderationConfidence || undefined,
                        isSafe: data.moderationData.isSafe !== undefined ? data.moderationData.isSafe : !hasSensitiveContent(data.moderationData),
                        rawMetadata: data.moderationData.rawResponse || undefined
                    },
                });
            } else {
                contentModerationMeta = await prisma.contentModerationMeta.create({
                    data: {
                        moderationLabels: data.moderationData.moderationLabels || extractModerationLabelsFromRawResponse(data.moderationData.rawResponse),
                        moderationConfidence: data.moderationData.moderationConfidence || undefined,
                        isSafe: data.moderationData.isSafe !== undefined ? data.moderationData.isSafe : !hasSensitiveContent(data.moderationData),
                        rawMetadata: data.moderationData.rawResponse || undefined
                    },
                });
            }
            updates.contentModerationMetaId = contentModerationMeta.id;
        }

        if (data?.faces && Array.isArray(data.faces) && data.faces.length > 0) {
            // Handle raw face detection response if provided
            if (data.faces[0]?.rawResponse) {
                // Process raw AWS responses for faces
                await processRawFaceResponse(id, data.faces);
            } else {
                // Process faces from AWS Rekognition via enrichment service
                const facesToCreate = data.faces.filter(face => face.action === 'create');
                const facesToUpdate = data.faces.filter(face => face.action === 'update');
                const facesToDelete = data.faces.filter(face => face.action === 'delete');

                // Handle creates - completely new face detections
                for (const face of data.faces) {
                    if (face.action === 'create') {
                        // Handle person identification or creation
                        let personId = face.personId;
                        
                        if (!personId && face.name) {
                            // Find or create the person - this logic remains in the API
                            // since it needs database access
                            let person = await prisma.person.findFirst({
                                where: {
                                    OR: [
                                        { name: face.name },
                                        { aliases: { has: face.name } },
                                    ],
                                },
                            });
                            
                            if (!person) {
                                person = await prisma.person.create({
                                    data: {
                                        name: face.name,
                                        aliases: face.aliases || [],
                                        isCelebrity: face.isCelebrity || false,
                                        celebrityInfo: face.info || undefined,
                                        // Store Rekognition-specific data for the person
                                        ...(face.externalIds && { 
                                            rawMetadata: { 
                                                rekognition: { 
                                                    faceId: face.externalIds.rekognition,
                                                    collectionId: face.collectionId
                                                } 
                                            } 
                                        })
                                    },
                                });
                            } else if (face.aliases && face.aliases.length > 0) {
                                const newAliases = face.aliases.filter(alias => !person.aliases.includes(alias));
                                if (newAliases.length > 0) {
                                    const updateData = { 
                                        aliases: { set: [...person.aliases, ...newAliases] }
                                    };
                                    
                                    // Update Rekognition IDs if provided and not already set
                                    if (face.externalIds && face.externalIds.rekognition) {
                                        if (!person.rawMetadata?.rekognition?.faceId) {
                                            updateData.rawMetadata = {
                                                ...(person.rawMetadata || {}),
                                                rekognition: { 
                                                    faceId: face.externalIds.rekognition,
                                                    collectionId: face.collectionId
                                                }
                                            };
                                        }
                                    }
                                    
                                    // Update celebrity info if this is a celebrity
                                    if (face.isCelebrity && face.info) {
                                        updateData.isCelebrity = true;
                                        updateData.celebrityInfo = face.info;
                                    }
                                    
                                    person = await prisma.person.update({
                                        where: { id: person.id },
                                        data: updateData
                                    });
                                }
                            }
                            
                            personId = person.id;
                        }
                        
                        // Create the face detection if we have a person
                        if (personId) {
                            // Store Rekognition-specific data in the detection
                            const faceDetectionData = {
                                confidence: face.confidence || 0.0,
                                boundingBox: face.boundingBox || {},
                                storageItemId: id,
                                personId,
                            };
                            
                            // Add attributes if provided
                            if (face.attributes || face.rawResponse) {
                                faceDetectionData.rawMetadata = {
                                    rekognition: {
                                        ...(face.attributes && { attributes: face.attributes }),
                                        ...(face.externalIds?.rekognition && { faceId: face.externalIds.rekognition }),
                                        ...(face.matchConfidence && { matchConfidence: face.matchConfidence }),
                                        ...(face.rawResponse && { raw: face.rawResponse })
                                    }
                                };
                            }
                            
                            await prisma.faceDetection.create({
                                data: faceDetectionData
                            });
                        }
                    }
                    
                    // Handle updates to existing face detections
                    else if (face.action === 'update' && face.detectionId) {
                        const updateData = {
                            confidence: face.confidence,
                            boundingBox: face.boundingBox || {}
                        };
                        
                        // Add Rekognition-specific updates
                        if (face.attributes || face.externalIds || face.rawResponse) {
                            updateData.rawMetadata = {
                                rekognition: {
                                    ...(face.attributes && { attributes: face.attributes }),
                                    ...(face.externalIds?.rekognition && { faceId: face.externalIds.rekognition }),
                                    ...(face.matchConfidence && { matchConfidence: face.matchConfidence }),
                                    ...(face.rawResponse && { raw: face.rawResponse })
                                }
                            };
                        }
                        
                        // If person changed, update the relationship
                        if (face.personId) {
                            updateData.personId = face.personId;
                        } 
                        // Handle person by name if no ID provided
                        else if (face.name) {
                            let person = await prisma.person.findFirst({
                                where: {
                                    OR: [
                                        { name: face.name },
                                        { aliases: { has: face.name } },
                                    ],
                                },
                            });
                            
                            if (!person) {
                                person = await prisma.person.create({
                                    data: {
                                        name: face.name,
                                        aliases: face.aliases || [],
                                        isCelebrity: face.isCelebrity || false,
                                        celebrityInfo: face.info || undefined,
                                        // Store Rekognition-specific data for the person
                                        ...(face.externalIds && { 
                                            rawMetadata: { 
                                                rekognition: { 
                                                    faceId: face.externalIds.rekognition,
                                                    collectionId: face.collectionId
                                                } 
                                            } 
                                        })
                                    },
                                });
                            }
                            
                            updateData.personId = person.id;
                        }
                        
                        await prisma.faceDetection.update({
                            where: { id: face.detectionId },
                            data: updateData
                        });
                    }
                }
                
                // Handle explicit deletions if provided
                if (facesToDelete.length > 0) {
                    const detectionIdsToDelete = facesToDelete
                        .filter(face => face.detectionId)
                        .map(face => face.detectionId);
                    
                    if (detectionIdsToDelete.length > 0) {
                        await prisma.faceDetection.deleteMany({
                            where: { id: { in: detectionIdsToDelete } }
                        });
                    }
                }
            }
        }

        // Update the storage item with all the collected updates
        const updatedItem = await prisma.storageItem.update({
            where: { id },
            data: updates,
            include: {
                geoMeta: true,
                ocrMeta: true,
                transcriptMeta: true,
                keywordMeta: true,
                labelMeta: true,
                customLabelMeta: true,
                contentModerationMeta: true,
                faceDetections: {
                    include: {
                        person: true,
                    },
                },
            },
        });

        return { success: true, item: updatedItem };
    } catch (error) {
        logger.error(`Error updating enrichment data for item ${id}:`, error);
        return { success: false, message: error.message };
    }
};

// Helper functions to extract minimal data from raw AWS responses
const extractTextFromRawResponse = (rawResponse) => {
    if (!rawResponse || !rawResponse.Blocks) return "";
    
    let text = "";
    for (const block of rawResponse.Blocks) {
        if (block.BlockType === 'LINE') {
            text += block.Text + "\n";
        }
    }
    return text.trim();
};

const extractLabelsFromRawResponse = (rawResponse) => {
    if (!rawResponse || !rawResponse.Labels) return [];
    
    return rawResponse.Labels.map(label => ({
        name: label.Name,
        confidence: label.Confidence,
        instances: label.Instances || []
    }));
};

const extractCustomLabelsFromRawResponse = (rawResponse) => {
    if (!rawResponse || !rawResponse.CustomLabels) return [];
    return rawResponse.CustomLabels;
};

const extractModerationLabelsFromRawResponse = (rawResponse) => {
    if (!rawResponse || !rawResponse.ModerationLabels) return [];
    return rawResponse.ModerationLabels;
};

const hasSensitiveContent = (moderationData) => {
    // Check if moderation data indicates sensitive content
    if (!moderationData) return false;
    
    // If we have rawResponse, check for any high confidence moderation labels
    if (moderationData.rawResponse && moderationData.rawResponse.ModerationLabels) {
        for (const label of moderationData.rawResponse.ModerationLabels) {
            if (label.Confidence > 80) {
                return true;
            }
        }
    }
    
    // If we have moderationLabels directly
    if (moderationData.moderationLabels && moderationData.moderationLabels.length > 0) {
        for (const label of moderationData.moderationLabels) {
            if (label.confidence > 80) {
                return true;
            }
        }
    }
    
    return false;
};

const processRawFaceResponse = async (storageItemId, faces) => {
    // Process raw AWS Rekognition face detection response
    if (!faces || !faces.length) return;
    
    for (const faceData of faces) {
        const rawResponse = faceData.rawResponse;
        if (!rawResponse) continue;
        
        // Basic extraction of face data from raw response
        const boundingBox = rawResponse.BoundingBox || {};
        const confidence = rawResponse.Confidence || 0;
        
        // Handle celebrity data if this is a celebrity
        let personId = null;
        if (faceData.isCelebrity && faceData.name) {
            // Find or create celebrity person
            let person = await prisma.person.findFirst({
                where: {
                    name: faceData.name,
                    isCelebrity: true
                }
            });
            
            if (!person) {
                person = await prisma.person.create({
                    data: {
                        name: faceData.name,
                        aliases: faceData.aliases || [],
                        isCelebrity: true,
                        celebrityInfo: faceData.info || {}
                    }
                });
            }
            
            personId = person.id;
        } else if (faceData.personId) {
            // Use provided person ID
            personId = faceData.personId;
        }
        
        // Skip if we don't have a person
        if (!personId) continue;
        
        // Create face detection with raw response
        await prisma.faceDetection.create({
            data: {
                confidence: confidence,
                boundingBox: {
                    x: boundingBox.Left * 100 || 0,
                    y: boundingBox.Top * 100 || 0,
                    width: boundingBox.Width * 100 || 0,
                    height: boundingBox.Height * 100 || 0
                },
                storageItemId,
                personId,
                rawMetadata: {
                    rekognition: {
                        raw: rawResponse,
                        // Add extracted attributes if needed
                        attributes: {
                            emotions: rawResponse.Emotions || [],
                            ageRange: rawResponse.AgeRange || {},
                            gender: rawResponse.Gender || {}
                        }
                    }
                }
            }
        });
    }
};

export default {
    createStorageItem,
    getStorageItemById,
    getStorageItems,
    deleteStorageItem,
    createNonFileStorageItem,
    updateEnrichmentData,
};
