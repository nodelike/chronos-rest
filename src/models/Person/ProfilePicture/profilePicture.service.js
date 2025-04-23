import logger from "../../../lib/logger.js";
import prisma from "../../../lib/prisma.js";

export const createProfilePicture = async (personId, s3Key) => {
    try {
        const profilePicture = await prisma.profilePicture.create({
            data: {
                s3Key,
                person: {
                    connect: {
                        id: personId,
                    },
                },
            },
        });

        return profilePicture;
    } catch (error) {
        logger.error(`Error setting profile picture for person ${personId}:`, error);
        throw error;
    }
};

export const getProfilePictures = async () => {
    const profilePictures = await prisma.profilePicture.findMany();
    return profilePictures;
};

export const getProfilePictureByPersonId = async (personId) => {
    const profilePicture = await prisma.profilePicture.findUnique({
        where: { personId },
    });
    return profilePicture;
};
