import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { hashPassword, generateVerificationCode, generateToken, calculateTokenExpiry } from "../../lib/auth.js";
import { isSignupEnabled } from "../../lib/utilsService.js";
import { sendVerificationEmail } from "../../lib/emailService.js";

export const findUserByEmail = async (email) => {
    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });
        const { password, verificationCode, verificationCodeExpires, ...userProfile } = user;
        return userProfile;
    } catch (error) {
        logger.error("Error finding user by email:", error);
        return null;
    }
};

export const createUser = async (userData) => {
    try {
        const signupsEnabled = await isSignupEnabled();
        if (!signupsEnabled) {
            logger.warn(`Signup attempt when signups are disabled: ${userData.email}`);
            return { error: "Signups are currently disabled" };
        }

        // Hash the password
        const hashedPassword = await hashPassword(userData.password);
        
        // Generate verification code
        const verificationCode = generateVerificationCode();
        const verificationCodeExpires = new Date(Date.now() + 10 * 60000); // 10 minutes
        
        // Create user with verification code
        const newUser = await prisma.user.create({
            data: {
                email: userData.email,
                username: userData.username,
                password: hashedPassword,
                verificationCode,
                verificationCodeExpires,
            },
        });

        // Send verification email
        await sendVerificationEmail(userData.email, verificationCode);
        
        // Remove sensitive data before returning
        const { password, verificationCode: code, ...userToReturn } = newUser;
        return userToReturn;
    } catch (error) {
        logger.error("Error creating user:", error);
        if (error.code === "P2002") {
            return { error: "Email already exists" };
        }
        return { error: "Error creating user" };
    }
};

export const verifyUser = async (email, code) => {
    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return { success: false, message: "User not found" };
        }

        if (user.isVerified) {
            return { success: true, message: "User already verified" };
        }

        if (!user.verificationCode) {
            return { success: false, message: "No verification code found" };
        }

        if (user.verificationCodeExpires < new Date()) {
            return { success: false, message: "Verification code has expired" };
        }

        if (user.verificationCode !== code) {
            return { success: false, message: "Invalid verification code" };
        }

        // Update user to verified and clear verification code
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                verificationCode: null,
                verificationCodeExpires: null,
            },
        });

        return { success: true, message: "User verified successfully" };
    } catch (error) {
        logger.error("Error verifying user:", error);
        return { success: false, message: "Error verifying user" };
    }
};

export const getUserProfile = async (userId) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return null;
        }

        // Remove sensitive data
        const { password, verificationCode, verificationCodeExpires, ...userProfile } = user;
        return userProfile;
    } catch (error) {
        logger.error("Error getting user profile:", error);
        return null;
    }
};

export const saveUserToken = async (userId, userData) => {
    try {
        // Generate new token
        const token = generateToken(userData);
        const tokenExpiry = calculateTokenExpiry();
        
        // Save token to database
        await prisma.user.update({
            where: { id: userId },
            data: {
                token,
                tokenExpiry,
            },
        });
        
        return { token, tokenExpiry };
    } catch (error) {
        logger.error("Error saving user token:", error);
        throw new Error("Failed to save authentication token");
    }
};

export const validateUserToken = async (userId, token) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { token: true, tokenExpiry: true },
        });
        
        if (!user || !user.token) {
            return false;
        }
        
        if (user.token !== token) {
            return false;
        }
        
        if (user.tokenExpiry && user.tokenExpiry < new Date()) {
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error("Error validating user token:", error);
        return false;
    }
};

export const invalidateUserToken = async (userId) => {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                token: null,
                tokenExpiry: null,
            },
        });
        
        return true;
    } catch (error) {
        logger.error("Error invalidating user token:", error);
        return false;
    }
};

export default {
    findUserByEmail,
    createUser,
    verifyUser,
    getUserProfile,
    saveUserToken,
    validateUserToken,
    invalidateUserToken
}; 