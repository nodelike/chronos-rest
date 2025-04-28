import { findOrCreatePerson } from "../person.service.js";
import prisma from "../../../lib/prisma.js";
import logger from "../../../lib/logger.js";

export const createFace = async (face, storageItemId) => {
    const { boundingBox, personId, name, emotions, age, gender, type: personType, profileS3Key, profileS3Url } = face;

    if (!boundingBox) {
        throw new Error("Invalid face data, need bounding box");
    }

    try {
        // Get the userId from the storage item
        const storageItem = await prisma.storageItem.findUnique({
            where: { id: storageItemId },
            select: { userId: true }
        });
        
        if (!storageItem) {
            throw new Error(`Storage item ${storageItemId} not found`);
        }

        const person = await findOrCreatePerson(
            personId, 
            name, 
            gender, 
            age, 
            personType, 
            profileS3Key, 
            profileS3Url, 
            storageItem.userId
        );

        const createdFace = await prisma.face.create({
            data: {
                boundingBox,
                emotions,
                age,
                gender,
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

        // Create association between person and storage item in the join table
        await prisma.personStorageItem.upsert({
            where: {
                personId_storageItemId: {
                    personId: person.id,
                    storageItemId
                }
            },
            update: {},
            create: {
                personId: person.id,
                storageItemId,
                userId: storageItem.userId
            }
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
