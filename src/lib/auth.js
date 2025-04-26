import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import "dotenv/config";
import logger from "./logger.js";

const SALT_ROUNDS = 10;

export const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashPassword = async (password) => {
    return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

export const generateToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
    });
};

export const calculateTokenExpiry = () => {
    // Parse JWT_EXPIRES_IN from environment variable (e.g., "7d", "24h", "60m")
    const expiresIn = process.env.JWT_EXPIRES_IN;
    let seconds = 86400; // Default to 1 day if parsing fails
    
    try {
        const unit = expiresIn.slice(-1);
        const value = parseInt(expiresIn.slice(0, -1));
        
        switch(unit) {
            case 's':
                seconds = value;
                break;
            case 'm':
                seconds = value * 60;
                break;
            case 'h':
                seconds = value * 3600;
                break;
            case 'd':
                seconds = value * 86400;
                break;
            default:
                seconds = parseInt(expiresIn);
                break;
        }
    } catch (error) {
        logger.warn("Failed to parse JWT_EXPIRES_IN, using default expiry", error);
    }
    
    return new Date(Date.now() + seconds * 1000);
};

export const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        logger.error("Token verification failed:", error);
        return null;
    }
};

export default {
    generateVerificationCode,
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken,
    calculateTokenExpiry
}; 