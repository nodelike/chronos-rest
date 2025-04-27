import express from "express";
import logger from "./lib/logger.js";
import "dotenv/config";
import userRoutes from "./models/User/user.routes.js";
import storageRoutes from "./models/StorageItem/storageItem.routes.js";
import personRoutes from "./models/Person/person.routes.js";
import enrichmentRoutes from "./models/StorageItem/enrichment.routes.js";
import { errorResponse, NotFoundError } from "./lib/helpers.js";
import cors from "cors";

const app = express();

BigInt.prototype.toJSON = function() {
    return this.toString();
};

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
  }))

// Middlewares
app.use(
    express.json({
        limit: "1mb",
        verify: (req, res, buf) => {
            req.rawBody = buf.toString();
        },
        // Handle JSON parsing errors
        reviver: (key, value) => {
            return value;
        },
    })
);
app.use(express.urlencoded({ extended: true }));

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        logger.warn("Bad JSON request:", { error: err.message, url: req.url });
        return res.status(400).json(errorResponse("Invalid JSON payload", 400));
    }
    next(err);
});

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        method: req.method,
        url: req.url,
        ip: req.ip,
    });
    next();
});

// Routes
app.use("/auth", userRoutes);
app.use("/storage", storageRoutes);
app.use("/enrichment", enrichmentRoutes);
app.use("/people", personRoutes);

// Default route
app.get("/", (req, res) => {
    res.json({ message: "Welcome to Chronos REST API" });
});

// 404 Route Handler - Must be added before the error handling middleware
app.use((req, res, next) => {
    logger.warn(`404 Not Found: ${req.method} ${req.url}`);
    const notFoundError = new NotFoundError(`Route not found: ${req.method} ${req.url}`);
    next(notFoundError);
});

// Error handling middleware
app.use((err, req, res) => {
    // Log the error
    logger.error("Application error:", {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
    });

    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "Something went wrong!";

    let errorDetails = {};

    if (process.env.NODE_ENV !== "production") {
        errorDetails = {
            stack: err.stack,
            type: err.name || err.constructor.name,
            ...(err.code && { code: err.code }),
            ...(err.errors && { validationErrors: err.errors }),
        };
    } else {
        if (statusCode >= 400 && statusCode < 500) {
            errorDetails = {
                ...(err.code && { code: err.code }),
                ...(err.errors && { validationErrors: err.errors }),
            };
        }
    }

    res.status(statusCode).json(errorResponse(message, statusCode, errorDetails));
});

export default app;
