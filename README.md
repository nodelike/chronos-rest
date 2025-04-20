# Chronos REST API

A RESTful API built with Express.js, Prisma, PostgreSQL, and S3-compatible storage.

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env` (if provided)
   - Update the PostgreSQL connection string in `.env` as `DATABASE_URL`
   - Set the desired `LOG_LEVEL` in `.env` (error, warn, info, http, verbose, debug, silly)
   - Configure Resend API key in `.env` for email sending
   - Configure AWS/S3 credentials in `.env`:
     - `AWS_REGION`
     - `AWS_S3_ENDPOINT`
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `AWS_BUCKET_NAME`
   - Configure RabbitMQ in `.env`:
     - `RABBITMQ_URL`

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
│   ├── imageMetadataService.js # Image processing and metadata extraction
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
- `uri`: A temporary secure URL for accessing the thumbnail, valid for 1 hour
- For images with thumbnails:
  - `rawMetadata.thumbnail`: A temporary secure URL for accessing the thumbnail, valid for 1 hour

## Current Implementation Status

### Database Migration

- Migrated from MongoDB to PostgreSQL for better relational data support
- Updated schema to leverage PostgreSQL's capabilities:
  - Foreign key constraints
  - One-to-one, one-to-many, and many-to-many relationships
  - Improved indexing

### Metadata Enrichment

Currently, the system implements basic metadata extraction for image files:

- **Image Processing** (`imageMetadataService.js`):
  - Basic metadata extraction (format, width, height, color space, channels, etc.)
  - Thumbnail generation (resized to 300x300px max while maintaining aspect ratio)
  - EXIF data extraction framework (in place but not fully implemented)
  - Placeholder for GPS data extraction from EXIF (structure ready but not implemented)

- **Storage Type Detection** (`storageItem.service.js`):
  - Automatic content type detection for:
    - Photos (image/*)
    - Videos (video/*)
    - Audio (audio/*)
    - Documents (pdf, msword, excel, etc.)
    - Other (fallback)

- **Manual Upload Pipeline**:
  - Currently only manual uploads are supported
  - Files are uploaded to S3 storage
  - Basic metadata is extracted and stored
  - Thumbnails are generated for images

### Enhanced Data Models

The database schema now includes expanded models for:

- **Person Management**:
  - Person profiles with name and aliases
  - Face detection linking to persons
  - Social profiles for each person
  - Person relationships (friend, colleague, family, etc.)

- **Social Media Integration**:
  - Social platform types (Twitter, Instagram, LinkedIn, etc.)
  - Social posts with content, hashtags, and posted date
  - Links between social posts and attachments

- **Metadata Models**:
  - Same core metadata models with improved relationships
  - Changed to one-to-one relationships for efficiency

## Microservice Architecture (In Progress)

### RabbitMQ Integration

The system now includes RabbitMQ integration for asynchronous processing:

- Configured via `RABBITMQ_URL` environment variable
- Will be used for message passing between services

### Planned Enrichment Microservice

A separate Python-based microservice is planned for enhanced metadata enrichment:

- Will consume messages from RabbitMQ queues
- Focused on AI-driven metadata extraction
- Separate from the main Express API
- Specialized for compute-intensive tasks

#### Planned Capabilities

The enrichment microservice will handle:

1. **Advanced Image Processing**:
   - Face detection and recognition
   - Object detection
   - Scene classification
   - Full EXIF and GPS data extraction

2. **Document Processing**:
   - OCR for text extraction
   - Document classification
   - Content summarization

3. **Audio/Video Processing**:
   - Speech-to-text transcription
   - Speaker identification
   - Content analysis

4. **Text Analysis**:
   - Named entity recognition
   - Keyword extraction
   - Sentiment analysis
   - Topic modeling

## Features To Be Implemented

### Core API Enhancements

1. **RabbitMQ Producer**:
   - Implement message publication to RabbitMQ queues
   - Create workflow for submitting items for processing
   - Develop retry mechanism for failed processing

2. **Webhook System**:
   - Add webhook support for notifying clients of completed processing
   - Create subscription model for processing events

### Python Enrichment Microservice

1. **Service Framework**:
   - Set up Python-based microservice structure
   - Implement RabbitMQ consumer
   - Create pluggable processing pipeline

2. **AI Models Integration**:
   - Integrate with open-source or cloud AI services
   - Implement model caching and optimization
   - Create abstraction layers for different AI providers

### Storage Search

Implement search capabilities for finding items based on:
- File content (OCR text)
- Metadata (format, size, etc.)
- Extracted information (faces, locations, keywords)
- Time periods

### Chronicle System

1. **Chronicle Creation**:
   - API endpoints for creating, updating, and deleting chronicles
   - Ability to group storage items into meaningful collections
   - Adding metadata to chronicles (title, description, tags, time range)

2. **Chronicle Relationships**:
   - Define connections between related chronicles
   - Support for nested chronicles or sub-chronicles

3. **Chronicle Search**:
   - Search functionality for finding chronicles
   - Filtering by metadata, content, time periods

## Settings

The application includes a database-driven settings system:

- `is-signup-enabled`: Controls whether new user signups are allowed
  - Default: `{ enabled: true }`
  - Update with database query or admin API 