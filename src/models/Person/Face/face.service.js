import { findOrCreatePerson } from "../person.service.js";
import prisma from "../../../lib/prisma.js";
import logger from "../../../lib/logger.js";

export const createFace = async (face, storageItemId) => {
    const { boundingBox, personId, name, emotions, age, gender, type: personType, profileS3Key, profileS3Url } = face;

    if (!boundingBox) {
        throw new Error("Invalid face data, need bounding box");
    }

    try {
        const person = await findOrCreatePerson(personId, name, gender, age, personType, profileS3Key, profileS3Url);

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
        return { success: true, message: "Face created successfully", face: createdFace };
    } catch (error) {
        logger.error(`Error creating face:`, error);
        throw error;
    }
};

export default {
    createFace,
};
