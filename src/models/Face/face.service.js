import { findOrCreatePerson } from "../Person/person.service.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { extractKeyFromUri } from "../../lib/s3Service.js";

export const createFace = async (face, storageItemId) => {
    const { confidence, boundingBox, personId, name, emotions, smile, ageRange, landmarks, type: personType, profileS3Key } = face;

    if (confidence === undefined || !boundingBox) {
        return { success: false, message: "Invalid face data, need confidence and bounding box" };
    }

    try {
        const person = await findOrCreatePerson(personId, name, personType, profileS3Key);

        const createdFace = await prisma.face.create({
            data: {
                confidence: parseFloat(confidence),
                boundingBox,
                emotions,
                smile,
                ageRange,
                landmarks,
                storageItem: {
                    connect: {
                        id: storageItemId,
                    },
                },
                person: {
                    connect: {
                        id: person.id,
                    },
                },
            },
            include: {
                storageItem: true,
                person: true
            },
        });
        return { success: true, message: "Face created successfully", face: createdFace };
    } catch (error) {
        logger.error(`Error creating face:`, error);
        throw error;
    }
};

// Helper function to create a profile picture from a face detection
export const createProfilePictureFromFace = async (personId, faceId, boundingBox, storageItem) => {
    try {
        const originalImageKey = extractKeyFromUri(storageItem.uri);
        if (!originalImageKey) {
            logger.error(`Invalid S3 URI for storage item: ${storageItem.uri}`);
            return { success: false, message: "Invalid S3 URI" };
        }

        // Now we need to extract the thumbnail from the original image using the face bounding box
        try {
            // Get the original image from S3
            const AWS = await import("aws-sdk");
            const s3 = new AWS.S3({
                region: process.env.AWS_REGION,
                endpoint: process.env.AWS_S3_ENDPOINT,
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                s3ForcePathStyle: true
            });
            
            const originalImage = await s3.getObject({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: originalImageKey
            }).promise();

            // Extract dimensions from the bounding box
            const { width, height, left, top } = extractBoundingBoxDimensions(boundingBox);
            
            // Create a thumbnail from the face region
            const thumbnailBuffer = await sharp(originalImage.Body)
                .extract({
                    left: Math.floor(left),
                    top: Math.floor(top),
                    width: Math.floor(width),
                    height: Math.floor(height)
                })
                .resize(200, 200, {
                    fit: 'cover',
                    position: 'center'
                })
                .toBuffer();

            // Upload the thumbnail to S3
            const thumbnailKey = `profile-pictures/${personId}/${uuidv4()}.jpg`;
            const uploadResult = await uploadBuffer(thumbnailBuffer, thumbnailKey, 'image/jpeg');

            // Check if a profile picture already exists for this person
            const existingProfilePicture = await prisma.profilePicture.findUnique({
                where: { personId }
            });

            if (existingProfilePicture) {
                // Update the existing profile picture
                await prisma.profilePicture.update({
                    where: { id: existingProfilePicture.id },
                    data: {
                        uri: uploadResult.Location
                    }
                });
            } else {
                // Create a new ProfilePicture entry
                await prisma.profilePicture.create({
                    data: {
                        personId,
                        uri: uploadResult.Location
                    }
                });
            }

            // Update the person with the faceId as profilePictureId
            await prisma.person.update({
                where: { id: personId },
                data: { profilePictureId: faceId }
            });

            logger.info(`Created/updated profile picture for person ${personId}`);
            return { success: true, message: "Profile picture created successfully" };
        } catch (error) {
            logger.error(`Error creating thumbnail for person ${personId}:`, error);
            return { success: false, message: "Error creating thumbnail" };
        }
    } catch (error) {
        logger.error(`Error creating profile picture for person ${personId}:`, error);
        throw error;
    }
};

// Helper function to extract dimensions from bounding box
function extractBoundingBoxDimensions(boundingBox) {
    // Handle different possible bounding box formats
    if (boundingBox.Width !== undefined) {
        // AWS Rekognition format
        return {
            width: boundingBox.Width * 100,
            height: boundingBox.Height * 100,
            left: boundingBox.Left * 100,
            top: boundingBox.Top * 100
        };
    } else if (boundingBox.width !== undefined) {
        // Standard format
        return boundingBox;
    } else {
        // Default fallback
        return {
            width: 100,
            height: 100,
            left: 0,
            top: 0
        };
    }
};

export const getUniqueFaces = async () => {
    try {
        const peopleWithFaces = await prisma.person.findMany({
            where: {
                face: {
                    some: {},
                },
            },
            select: {
                id: true,
                name: true,
                profilePicture: {
                    select: {
                        id: true,
                        boundingBox: true,
                        storageItemId: true,
                        storageItem: {
                            select: {
                                uri: true,
                            },
                        },
                    },
                },
            },
        });

        const results = await Promise.all(
            peopleWithFaces.map(async (person) => {
                const face = person.profilePicture;
                const storageItem = face.storageItem;

                let profileS3Key = null;
                if (storageItem.uri) {
                    const imageKey = extractKeyFromUri(storageItem.uri);
                    if (imageKey) {
                        profileS3Key = imageKey;
                    }
                }

                return {
                    personId: person.id,
                    name: person?.name,
                    faceDetectionId: face.id,
                    storageItemId: face.storageItemId,
                    boundingBox: face.boundingBox,
                    s3Key: profileS3Key,
                    uri: storageItem.uri,
                };
            })
        );

        return results;
    } catch (error) {
        logger.error("Error getting face detections for comparison:", error);
        throw error;
    }
};

export default {
    createFace,
    createProfilePictureFromFace
};
