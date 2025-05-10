import logger from "../../../lib/logger.js";
import prisma from "../../../lib/prisma.js";
import { getPresignedUrl } from "../../../lib/s3Service.js";

export const createProfilePicture = async (personId, s3Key, s3Url) => {
    try {
        const profilePicture = await prisma.profilePicture.create({
            data: {
                s3Key,
                s3Url,
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

export const getProfilePictures = async (userId) => {
    try {
        if (!userId) {
            throw new Error("UserId is required");
        }

        const profilePictures = await prisma.profilePicture.findMany({
            where: {
                person: {
                    face: {
                        some: {
                            userId: userId,
                        },
                    },
                },
            },
            include: {
                person: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        // Add presigned URLs to each profile picture
        const profilePicturesWithUrls = await Promise.all(
            profilePictures.map(async (profilePicture) => {
                const presignedUrl = await getPresignedUrl(profilePicture.s3Key);
                return {
                    ...profilePicture,
                    uri: presignedUrl,
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
                uri: presignedUrl,
            };
        }

        return profilePicture;
    } catch (error) {
        logger.error(`Error getting profile picture for person ${personId}:`, error);
        throw error;
    }
};
