import { findOrCreatePerson } from "../person.service.js";
import prisma from "../../../lib/prisma.js";
import logger from "../../../lib/logger.js";

export const createFace = async (face, storageItemId) => {
    const { confidence, boundingBox, personId, name, emotions, smile, ageRange, landmarks, type: personType, profileS3Key } = face;

    if (confidence === undefined || !boundingBox) {
        throw new Error("Invalid face data, need confidence and bounding box");
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

export default {
    createFace,
};
