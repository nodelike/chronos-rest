import logger from "../../../lib/logger.js";
import prisma from "../../../lib/prisma.js";
import { getPresignedUrl } from "../../../lib/s3Service.js";

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
    try {
        const profilePictures = await prisma.profilePicture.findMany();
        
        // Add presigned URLs to each profile picture
        const profilePicturesWithUrls = await Promise.all(
            profilePictures.map(async (profilePicture) => {
                const presignedUrl = await getPresignedUrl(profilePicture.s3Key);
                return {
                    ...profilePicture,
                    uri: presignedUrl
                };
            })
        );
        
        return profilePicturesWithUrls;
    } catch (error) {
        logger.error("Error getting profile pictures:", error);
        throw error;
    }
};

export const getProfilePictureByPersonId = async (personId) => {
    try {
        const profilePicture = await prisma.profilePicture.findUnique({
            where: { personId },
        });
        
        if (profilePicture) {
            const presignedUrl = await getPresignedUrl(profilePicture.s3Key);
            return {
                ...profilePicture,
                uri: presignedUrl
            };
        }
        
        return profilePicture;
    } catch (error) {
        logger.error(`Error getting profile picture for person ${personId}:`, error);
        throw error;
    }
};
