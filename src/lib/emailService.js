import { Resend } from "resend";
import logger from "./logger.js";
import "dotenv/config";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (to, verificationCode) => {
    try {
        const { data, error } = await resend.emails.send({
            from: "Chronos <onboarding@nodelike.com>",
            to,
            subject: "Email Verification",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                    <h2 style="color: #333;">Verify Your Email</h2>
                    <p>Thank you for signing up. Please use the following verification code to complete your registration:</p>
                    <div style="background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                        <strong>${verificationCode}</strong>
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this verification, please ignore this email.</p>
                </div>
            `,
        });

        if (error) {
            logger.error("Error sending verification email:", error);
            return false;
        }

        logger.info(`Verification email sent to ${to}`, { id: data.id });
        return true;
    } catch (error) {
        logger.error("Error sending verification email:", error);
        return false;
    }
};

export default {
    sendVerificationEmail,
};
