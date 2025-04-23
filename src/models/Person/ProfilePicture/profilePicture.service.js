import { uploadBuffer, getObjectByUri } from "../../../lib/s3Service.js";
import { thumbnailFromImage, streamToBuffer } from "./profilePicture.utils.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../../../lib/logger.js";

import prisma from "../../../lib/prisma.js";
import { getStorageItemById } from "../../StorageItem/storageItem.service.js";

export const createProfilePicture = async (personId, boundingBox, storageItemId) => {
    const storageItem = await getStorageItemById(storageItemId);
    try {
        const originalImage = await getObjectByUri(storageItem.uri);
        const imageBuffer = await streamToBuffer(originalImage.Body);
        const thumbnailBuffer = await thumbnailFromImage(imageBuffer, boundingBox);
        const thumbnailKey = `profile-pictures/${personId}/${uuidv4()}.jpg`;
        const uploadResult = await uploadBuffer(thumbnailBuffer, thumbnailKey, "image/jpeg");

        const profilePicture = await prisma.profilePicture.create({
            data: {
                personId,
                uri: uploadResult.uri,
            },
        });

        return profilePicture;
    } catch (error) {
        logger.error(`Error creating thumbnail for person ${personId}:`, error);
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
