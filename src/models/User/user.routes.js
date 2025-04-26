import express from "express";
import { login, verify, logout } from "./user.controller.js";
import { authenticate } from "../../lib/middleware/authenticate.js";
import { validateLogin, validateVerify } from "./user.validators.js";

const router = express.Router();

router.post("/login", validateLogin, login);
router.post("/verify", validateVerify, verify);
router.post("/logout", authenticate, logout);

// Protected routes
router.get("/profile", authenticate, (req, res) => {
    res.json({
        success: true,
        message: "Profile data",
        data: {
            user: req.user
        }
    });
});

export default router; 