import multer from "multer";
import { BadRequestError } from "../helpers.js";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        // Images
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        
        // Videos
        'video/mp4',
        'video/webm',
        'video/quicktime',
        
        // Audio
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new BadRequestError(`File type '${file.mimetype}' is not supported`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: process.env.MAX_FILE_SIZE * 1024 * 1024,
    }
});


// Single file upload middleware
export const uploadSingle = (fieldName = 'file') => {
    return (req, res, next) => {
        const uploadMiddleware = upload.single(fieldName);
        
        uploadMiddleware(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return next(new BadRequestError('File too large. Maximum size is 50MB'));
                    }
                    return next(new BadRequestError(err.message));
                }
                
                return next(err);
            }
            
            next();
        });
    };
};

// Multiple files upload middleware
export const uploadMultiple = (fieldName = 'files', maxCount = 10) => {
    return (req, res, next) => {
        const uploadMiddleware = upload.array(fieldName, maxCount);
        
        uploadMiddleware(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return next(new BadRequestError('File too large. Maximum size is 50MB'));
                    } else if (err.code === 'LIMIT_FILE_COUNT') {
                        return next(new BadRequestError(`Too many files. Maximum is ${maxCount}`));
                    }
                    return next(new BadRequestError(err.message));
                }
                
                return next(err);
            }
            
            next();
        });
    };
};

export default {
    uploadSingle,
    uploadMultiple
}; 