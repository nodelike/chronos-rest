import { findOrCreatePerson } from "../Person/person.service.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { extractKeyFromUri } from "../../lib/s3Service.js";

export const createFace = async (face, storageItemId) => {
    const { confidence, boundingBox, personId, name, emotions, smile, ageRange, landmarks, type: personType } = face;

    if (confidence === undefined || !boundingBox) {
        return { success: false, message: "Invalid face data, need confidence and bounding box" };
    }

    try {
        const createdFace = await prisma.face.create({
            data: {
                confidence: parseFloat(confidence),
                boundingBox,
                emotions,
                smile,
                ageRange,
                landmarks,
                personId: personId, // This will be updated after person creation
                storageItemId: storageItemId,
            }
        });
        
        let person = await findOrCreatePerson(personId, name, personType, createdFace.id);
        
        if (createdFace.personId !== person.id) {
            await prisma.face.update({
                where: { id: createdFace.id },
                data: { personId: person.id }
            });
        }

        return { success: true, message: "Face created successfully" };
    } catch (error) {
        logger.error(`Error creating face:`, error);
        return { success: false, message: "Error creating face:" + error.message };
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
        return { success: false, message: "Error getting face detections for comparison:" + error.message };
    }
};

export default {
    createFace
};
