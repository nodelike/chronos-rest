# Chronos REST API

A RESTful API built with Express.js, Prisma, PostgreSQL, and S3-compatible storage.

[Current Architecture](./system-design.png)

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
   - Configure AWS EventBridge in `.env`:
     - `AWS_EVENT_BUS_NAME`
   - Configure Enrichment Service:
     - `ENRICHMENT_SERVICE_API_KEY` for securing the enrichment callback API

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
│   ├── eventBridgeClient.js # AWS EventBridge integration for enrichment
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

- **POST /storage/file**
  - Upload a file to S3 storage
  - Requires multipart/form-data with a "file" field
  - Automatically queues for enrichment processing

- **POST /storage/item**
  - Create a non-file item (EVENT, NOTE, LOCATION, LINK, SOCIAL_MEDIA)
  - Certain types (LINK, SOCIAL_MEDIA) are automatically queued for enrichment

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

The system implements comprehensive metadata extraction for media files:

- **Image Processing** (`imageMetadataService.js`):
  - Basic metadata extraction (format, width, height, color space, channels, etc.)
  - Thumbnail generation (resized to 300x300px max while maintaining aspect ratio)
  - EXIF data extraction framework (in place but not fully implemented)
  - Placeholder for GPS data extraction from EXIF (structure ready but not implemented)
  - Integration with AWS Rekognition for face detection and recognition
  - Integration with AWS Textract for OCR and document analysis

- **AWS AI Services Integration** (`storageItem.service.js`):
  - Face detection with AWS Rekognition
    - Detection of faces in images
    - Face recognition and matching against existing collections
    - Storage of face attributes (age range, emotions, gender, etc.)
    - Person identity management with face matching
  - OCR with AWS Textract
    - Full text extraction from images and documents
    - Structured data extraction (blocks, lines, words)
    - Form and table extraction
    - Metadata about text position and confidence scores
  - Comprehensive AWS Rekognition integration:
    - **Face Detection and Analysis**
      - Detection of faces in images and videos
      - Face recognition and matching against collections
      - Storage of facial attributes (age range, emotions, gender, etc.)
      - Person identity management with face matching
    - **Object and Scene Detection**
      - Identification of thousands of objects and scenes
      - Confidence scores for each detected label
      - Dominant colors and image quality assessment
    - **Celebrity Recognition**
      - Identification of celebrities as a special type of Person
      - Full integration with the face recognition system
      - Celebrity metadata stored directly in Person records
      - Unified person identity system for both regular and celebrity people
    - **Custom Label Detection**
      - Support for custom-trained object detection models
      - Brand logo detection and custom object identification
      - Model version tracking
    - **Content Moderation**
      - Detection of unsafe or inappropriate content
      - Categorization of potentially offensive material
      - Safety flags with confidence scores
    - **Text Detection**
      - Extraction of text from images (street signs, posters, etc.)
      - Support for skewed and distorted text
  - **OCR with AWS Textract**
    - Full text extraction from images and documents
    - Structured data extraction (blocks, lines, words)
    - Form and table extraction
    - Metadata about text position and confidence scores

- **Storage Type Detection** (`storageItem.service.js`):
  - Automatic content type detection for:
    - Photos (image/*)
    - Videos (video/*)
    - Audio (audio/*)
    - Documents (pdf, msword, excel, etc.)
    - Other (fallback)

### Enhanced Data Models

The database schema now includes expanded models for:

- **Person Management**:
  - Person profiles with name and aliases
  - Face detection linking to persons
  - Face recognition with AWS Rekognition integration
  - Progressive learning system that improves person recognition over time
  - Social profiles for each person
  - Person relationships (friend, colleague, family, etc.)

- **Social Media Integration**:
  - Social platform types (Twitter, Instagram, LinkedIn, etc.)
  - Social posts with content, hashtags, and posted date
  - Links between social posts and attachments

- **Metadata Models**:
  - Same core metadata models with improved relationships
  - Changed to one-to-one relationships for efficiency

## Storage and Enrichment Pipeline

- **Manual Upload Pipeline**:
  - Currently only manual uploads are supported
  - Files are uploaded to S3 storage
  - Basic metadata is extracted and stored
  - Thumbnails are generated for images
  - Files are sent to the serverless enrichment service via AWS EventBridge for AI processing

## Microservice Architecture

### AWS EventBridge Integration

The system includes AWS EventBridge integration for serverless, event-driven processing:

- Configured via `AWS_EVENT_BUS_NAME` environment variable
- Used for event-driven communication with the Chronos Enricher service
- Automatically sends events for new file uploads for enrichment
- Also sends events for certain non-file items (LINK, SOCIAL_MEDIA) for enrichment

### Enrichment Architecture Flow

1. **Storage Creation**:
   - When a file is uploaded via `/storage/file` or a non-file item is created via `/storage/item`
   - The system automatically publishes an enrichment event to AWS EventBridge
   - Event includes item ID, media type, S3 bucket/key, and basic metadata

2. **Chronos Enricher Service**:
   - Consumes events from EventBridge
   - Uses Step Functions workflows for image and video processing
   - Performs enrichment using AWS AI services:
     - Face detection and recognition with AWS Rekognition
     - OCR and document analysis with AWS Textract
     - Additional metadata extraction
   - Manages face collections and identity matching
   - Makes intelligent decisions about updating existing data vs. creating new entries
   - When processing is complete, calls back to the REST API

3. **Update API**:
   - Enricher service submits enrichment results back via `/storage/enrichment/:id`
   - API is secured using an API key in `x-api-key` header
   - Updates StorageItem and related metadata models in the database
   - Maintains persistent identity relationships and knowledge base
   - Stores structured data for advanced querying

### Enrichment Service API

- **POST /storage/enrichment/:id**
  - Updates a storage item with enrichment results
  - Requires API key authentication via `x-api-key` header
  - Request body format:
    ```json
    {
      "status": "success|failure",
      "rekognitionMeta": {
        "processingTime": 1.25,
        "serviceVersion": "1.0",
        "modelVersion": "4.0"
      },
      "data": {
        "geoData": { "lat": 0.0, "lng": 0.0, "place": "Location Name" },
        "ocrData": { 
          "text": "Extracted text", 
          "language": "en",
          "textractMeta": {
            "processingTime": 0.45,
            "documentType": "PLAIN_TEXT"
          },
          "blocks": [
            {
              "type": "LINE",
              "text": "Sample text line",
              "confidence": 0.98,
              "boundingBox": {
                "x": 10, "y": 20,
                "width": 400, "height": 30
              },
              "words": [
                {
                  "text": "Sample",
                  "confidence": 0.99,
                  "boundingBox": {...}
                }
              ]
            }
          ]
        },
        "labelData": {
          "labels": [
            {
              "name": "Person",
              "confidence": 0.98,
              "boundingBox": {
                "x": 0, "y": 0,
                "width": 100, "height": 200
              }
            },
            {
              "name": "Car",
              "confidence": 0.85,
              "boundingBox": {...}
            }
          ],
          "dominantColors": [
            {
              "color": "#336699", 
              "percentage": 0.35
            }
          ],
          "imageQuality": {
            "brightness": 0.8,
            "sharpness": 0.7
          }
        },
        "celebrityData": {
          "celebrities": [
            {
              "name": "Celebrity Name",
              "confidence": 0.94,
              "boundingBox": {...},
              "info": {
                "urls": ["https://www.imdb.com/..."],
                "occupation": "Actor",
                "verified": true
              }
            }
          ]
        },
        "customLabelData": {
          "customLabels": [
            {
              "name": "Company Logo",
              "confidence": 0.92,
              "boundingBox": {...}
            }
          ],
          "modelVersion": "1.0"
        },
        "moderationData": {
          "moderationLabels": [
            {
              "name": "Suggestive",
              "confidence": 0.75,
              "parentName": "Suggestive"
            }
          ],
          "moderationConfidence": 0.65,
          "isSafe": true
        },
        "transcriptData": { "transcript": "Full transcript", "language": "en" },
        "keywords": ["keyword1", "keyword2"],
        "faces": [
          {
            "action": "create",
            "name": "Person Name",
            "aliases": ["Nickname"],
            "confidence": 0.95,
            "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 100 },
            "personId": "existing-person-id", // Optional
            "externalIds": {
              "rekognition": "face-id-in-collection"
            },
            "collectionId": "my-face-collection",
            "matchConfidence": 0.92,
            "attributes": {
              "ageRange": { "low": 25, "high": 35 },
              "emotions": [
                { "type": "HAPPY", "confidence": 0.95 }
              ],
              "gender": { "value": "Female", "confidence": 0.99 }
            }
          },
          {
            "action": "update",
            "detectionId": "existing-detection-id",
            "confidence": 0.98,
            "boundingBox": { "x": 15, "y": 25, "width": 95, "height": 95 }
          }
        ],
        "error": "Error message if status is failure"
      }
    }
    ```

### EventBridge Event Format

The events sent to EventBridge have the following format:

```json
{
  "Source": "com.chronos.enricher",
  "DetailType": "EnrichmentRequested",
  "Detail": {
    "itemId": "unique-item-id",
    "mediaType": "image|video|audio|document|link|social_media",
    "s3Bucket": "your-s3-bucket",
    "s3Key": "path/to/your/file.jpg",
    "metadata": { /* initial metadata */ }
  }
}
```

## Features To Be Implemented

### AI Integration Enhancements

1. **Advanced Identity Management**:
   - Face embedding vectors for similarity search
   - Person identity merging for duplicate resolution
   - Confidence threshold adjustments for face recognition

2. **Multi-service Integration**:
   - Support for multiple AI providers (Google Vision, Azure Cognitive Services)
   - A/B testing between different AI services
   - Model version tracking and performance metrics

3. **Content Understanding**:
   - Scene understanding and labeling
   - Object detection and classification
   - Content moderation and filtering
   - Custom labels and model training

### Core API Enhancements

1. **Webhook System**:
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

## Future Tasks

- **Infrastructure**:
  - Set up CI/CD pipeline for automated testing and deployment
  - Add Docker containerization for local development
  - Implement comprehensive error handling strategy
  - Enhance logging with structured JSON format
  - Add monitoring with Prometheus/Grafana

- **Engineering**:
  - Implement API rate limiting
  - Additional unit and integration tests
  - Build WebSocket integration for real-time updates
  - Implement caching layer
  - Improve error handling and validation

- **Features**:
  - Implement batch operations for storage items
  - Add search capabilities with Elasticsearch
  - Build timeline generation with customizable filters
  - Develop geo-fencing and location-based retrieval
  - Create content classification and smart collections
  - Implement media clustering and deduplication 