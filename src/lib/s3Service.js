import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import logger from "./logger.js";
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

        logger.info(`File uploaded successfully to ${url}`);

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

        logger.info(`File deleted successfully: ${key}`);

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
        let pathParts = url.pathname.split('/').filter(Boolean);
        
        
        if (pathParts.length >= 2 && pathParts[0] === bucketName && pathParts[1] === bucketName) {
            const extractedKey = pathParts.slice(1).join('/');
            return extractedKey;
        } 
        else if (pathParts[0] === bucketName) {
            const extractedKey = pathParts.slice(1).join('/');
            return extractedKey;
        } 
        else {
            const extractedKey = pathParts.join('/');
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
        
        if (item.rawMetadata && item.rawMetadata.thumbnail) {
            const thumbnailKey = extractKeyFromUri(item.rawMetadata.thumbnail);
            if (thumbnailKey) {
                result.rawMetadata = { 
                    ...item.rawMetadata,
                };
                result.rawMetadata.thumbnail = await getPresignedUrl(thumbnailKey);
            }
        }
        
        return result;
    } catch (error) {
        logger.error(`Error replacing URLs with presigned URLs for item ${item.id}:`, error);
        return item;
    }
};

export default {
    uploadFile,
    deleteFile,
    getPresignedUrl,
    extractKeyFromUri,
    replaceWithPresignedUrls
};
