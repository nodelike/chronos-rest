import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import logger from "./logger.js";
import { processImageFormat } from "./imageMetadataService.js";
import "dotenv/config";

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    endpoint: process.env.AWS_S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

const bucketName = process.env.AWS_BUCKET_NAME;

export const uploadBuffer = async (buffer, key, contentType) => {
    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        });

        const uploadResult = await s3Client.send(command);

        const url = `${process.env.AWS_S3_ENDPOINT}/${bucketName}/${key}`;

        return {
            success: true,
            uri: url,
            key: key,
            bucket: bucketName,
            etag: uploadResult.ETag,
        };
    } catch (error) {
        logger.error("Error uploading buffer to S3:", error);
        throw error;
    }
};

export const uploadFile = async (buffer, originalName, mimeType, folder = "uploads") => {
    try {
        const fileExtension = originalName.split(".").pop();
        const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: mimeType,
        });

        const uploadResult = await s3Client.send(command);

        const url = `${process.env.AWS_S3_ENDPOINT}/${bucketName}/${fileName}`;

        return {
            success: true,
            url,
            key: fileName,
            bucket: bucketName,
            etag: uploadResult.ETag,
        };
    } catch (error) {
        logger.error("Error uploading file to S3:", error);
        throw error;
    }
};

export const deleteFile = async (key) => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        await s3Client.send(command);

        return {
            success: true,
            key,
        };
    } catch (error) {
        logger.error(`Error deleting file from S3: ${key}`, error);
        throw error;
    }
};

export const extractKeyFromUri = (uri) => {
    if (!uri) return null;

    try {
        logger.debug(`Extracting key from URI: ${uri}`);

        const url = new URL(uri);
        let pathParts = url.pathname.split("/").filter(Boolean);

        if (pathParts.length >= 2 && pathParts[0] === bucketName && pathParts[1] === bucketName) {
            const extractedKey = pathParts.slice(1).join("/");
            return extractedKey;
        } else if (pathParts[0] === bucketName) {
            const extractedKey = pathParts.slice(1).join("/");
            return extractedKey;
        } else {
            const extractedKey = pathParts.join("/");
            return extractedKey;
        }
    } catch (error) {
        logger.error(`Error extracting key from URI: ${uri}`, error);
        throw error;
    }
};

export const getPresignedUrl = async (key, expiresIn = 3600) => {
    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn });

        return url;
    } catch (error) {
        logger.error(`Error generating presigned URL for: ${key}`, error);
        throw error;
    }
};

export const replaceWithPresignedUrls = async (item) => {
    if (!item) return null;

    try {
        const result = { ...item };

        const fileKey = extractKeyFromUri(item.uri);
        if (fileKey) {
            result.uri = await getPresignedUrl(fileKey);
        }

        const thumbnailKey = extractKeyFromUri(item.thumbnail);
        if (thumbnailKey) {
            result.thumbnail = await getPresignedUrl(thumbnailKey);
        }

        // Handle face detections and their associated persons with profile pictures
        if (result.face && Array.isArray(result.face)) {
            for (let i = 0; i < result.face.length; i++) {
                if (result.face[i].person && result.face[i].person.profilePicture) {
                    const profilePicKey = extractKeyFromUri(result.face[i].person.profilePicture.s3Url);
                    if (profilePicKey) {
                        result.face[i].person.profilePicture.s3Url = await getPresignedUrl(profilePicKey);
                    }
                }
            }
        }

        return result;
    } catch (error) {
        logger.error(`Error replacing URLs with presigned URLs for item ${item.id}:`, error);
        return item;
    }
};

export const getObjectByUri = async (uri) => {
    const key = extractKeyFromUri(uri);
    if (!key) {
        logger.error(`Invalid S3 URI: ${uri}`);
        throw new Error("Invalid S3 URI");
    }

    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        const response = await s3Client.send(command);
        return response;
    } catch (error) {
        logger.error(`Error getting object from S3: ${key}`, error);
        throw error;
    }
};

export const uploadImageWithFormatProcessing = async (buffer, originalName, folder = "images") => {
    try {
        // Process the image to the correct format
        const { buffer: processedBuffer, format, contentType } = await processImageFormat(buffer);

        // Generate a unique filename with the correct extension
        const fileName = `${folder}/${uuidv4()}.${format}`;

        // Upload the processed image
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            Body: processedBuffer,
            ContentType: contentType,
        });

        const uploadResult = await s3Client.send(command);
        const url = `${process.env.AWS_S3_ENDPOINT}/${bucketName}/${fileName}`;

        return {
            success: true,
            url,
            key: fileName,
            bucket: bucketName,
            format,
            etag: uploadResult.ETag,
        };
    } catch (error) {
        logger.error("Error uploading processed image to S3:", error);
        throw error;
    }
};

export default {
    uploadFile,
    uploadBuffer,
    deleteFile,
    getPresignedUrl,
    extractKeyFromUri,
    replaceWithPresignedUrls,
    getObjectByUri,
    uploadImageWithFormatProcessing,
};
