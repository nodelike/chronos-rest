import { findUserByEmail, createUser, verifyUser } from "./user.service.js";
import { comparePassword, generateToken, generateVerificationCode } from "../../lib/auth.js";
import { successResponse, errorResponse } from "../../lib/helpers.js";
import { sendVerificationEmail } from "../../lib/emailService.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await findUserByEmail(email);
        if (user) {
            const isPasswordValid = await comparePassword(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json(errorResponse("Invalid credentials", 401));
            }

            if (!user.isVerified) {
                const verificationCode = generateVerificationCode();
                const verificationCodeExpires = new Date(Date.now() + 10 * 60000);

                // Update user with new verification code
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        verificationCode,
                        verificationCodeExpires,
                    },
                });

                await sendVerificationEmail(email, verificationCode);

                return res
                    .status(200)
                    .json(
                        successResponse("Verification code sent to your email.", {
                            requiresVerification: true,
                            email,
                        })
                    );
            }

            // Generate JWT token
            const token = generateToken({
                id: user.id,
                email: user.email,
                username: user.username,
            });

            const { ...userData } = user;

            return res.status(200).json(
                successResponse("Login successful", {
                    token,
                    user: userData,
                })
            );
        }
        else {
            const result = await createUser({
                email,
                password,
                username: email.split("@")[0],
            });

            if (result.error) {
                return res.status(400).json(errorResponse(result.error, 400));
            }

            return res.status(200).json(successResponse("User created. Please verify your email.", { requiresVerification: true, email }));
        }
    } catch (error) {
        logger.error("Login error:", error);
        return res.status(500).json(errorResponse("An error occurred during login", 500));
    }
};

export const verify = async (req, res) => {
    try {
        const { email, code } = req.body;

        const result = await verifyUser(email, code);

        if (!result.success) {
            return res.status(400).json(errorResponse(result.message, 400));
        }

        // Get the verified user
        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(404).json(errorResponse("User not found after verification", 404));
        }

        // Generate token for the verified user
        const token = generateToken({
            id: user.id,
            email: user.email,
            username: user.username,
        });

        const { ...userData } = user;

        return res.status(200).json(
            successResponse(result.message, {
                token,
                user: userData,
            })
        );
    } catch (error) {
        logger.error("Verification error:", error);
        return res.status(500).json(errorResponse("An error occurred during verification", 500));
    }
};

export default {
    login,
    verify,
};
