# Chronos REST API

A RESTful API built with Express.js, Prisma, MongoDB, and S3-compatible storage.

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env` (if provided)
   - Update the MongoDB connection string in `.env`
   - Set the desired `LOG_LEVEL` in `.env` (error, warn, info, http, verbose, debug, silly)
   - Configure Resend API key in `.env` for email sending
   - Configure AWS/S3 credentials in `.env`:
     - `AWS_REGION`
     - `AWS_S3_ENDPOINT`
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `AWS_BUCKET_NAME`

3. Generate Prisma client:
   ```
   npm run prisma:generate
   ```

4. Push the schema to your database:
   ```
   npm run prisma:push
   ```

5. Seed the database with initial settings:
   ```
   npm run seed
   ```

6. Start the server:
   ```
   npm start
   ```
   
   For development with hot reload:
   ```
   npm run dev
   ```

## Project Structure

```
src/
├── models/                # Core domain models
│   ├── User/              # User model
│   │   ├── user.controller.js
│   │   ├── user.service.js
│   │   ├── user.routes.js
│   │   └── user.validators.js
│   ├── StorageItem/       # Storage item model
│   │   ├── storageItem.controller.js
│   │   ├── storageItem.routes.js
│   │   └── storageItem.service.js
│   └── Product/           # Product model (example)
├── lib/                   # Shared utilities
│   ├── prisma.js          # Prisma client instance
│   ├── logger.js          # Winston logger configuration
│   ├── auth.js            # Authentication utilities
│   ├── emailService.js    # Email service using Resend
│   ├── s3Service.js       # S3 storage service
│   ├── utilsService.js    # Utility service for app settings
│   ├── middleware/
│   │   ├── authenticate.js # Authentication middleware
│   │   └── upload.js       # File upload middleware
│   └── helpers.js
├── app.js                 # Express app configuration
└── server.js              # Server entry point
prisma/
├── schema.prisma          # Prisma schema
└── seed.js                # Database seed script
logs/                      # Application logs
```

## Logging

The application uses Winston for logging with the following features:
- Multiple log levels (error, warn, info, http, verbose, debug, silly)
- Console output with colorization
- File-based logging with separate files for errors and combined logs
- Automatic exception and rejection handling

Log level can be configured in the `.env` file.

## Authentication

The API includes a complete authentication system with the following features:

- Login with email/password
- Email verification via OTP (One-Time Password)
- JWT token-based authentication
- Protected routes using authentication middleware
- Global signup enable/disable feature through database settings

### API Endpoints

#### Authentication Endpoints

- **POST /auth/login**
  - Login with email and password
  - If user exists, returns JWT token
  - If user doesn't exist, creates a new user and sends verification email

- **POST /auth/verify**
  - Verify user's email with verification code
  - Returns JWT token upon successful verification

- **GET /auth/profile** (Protected)
  - Returns the user's profile information
  - Requires authentication

## Storage System

The application integrates with S3-compatible storage services for file storage:

### S3 Storage Features
- File uploads with unique IDs
- Public and private file storage
- Presigned URL generation for secure temporary access
- File deletion

### Storage API Endpoints

All storage endpoints require authentication.

- **POST /storage**
  - Upload a file to S3 storage
  - Requires multipart/form-data with a "file" field

- **GET /storage**
  - List all storage items for the authenticated user
  - Returns items with presigned URLs that expire after 1 hour

- **GET /storage/:id**
  - Get details for a specific storage item
  - Returns the item with a presigned URL that expires after 1 hour

- **DELETE /storage/:id**
  - Delete a storage item and its associated file

### Storage Item Response Format

Each storage item returned by the API includes:
- Standard item metadata (id, fileName, fileSize, etc.)
- `uri`: The original S3 URL (preserved for reference)
- `presignedUrl`: A temporary secure URL for accessing the file, valid for 1 hour
- For images with thumbnails:
  - `rawMetadata.thumbnail`: The original thumbnail S3 URL (preserved for reference)
  - `rawMetadata.thumbnailPresignedUrl`: A temporary secure URL for accessing the thumbnail, valid for 1 hour

## Settings

The application includes a database-driven settings system:

- `is-signup-enabled`: Controls whether new user signups are allowed
  - Default: `{ enabled: true }`
  - Update with database query or admin API 