# Chronos Enricher

A serverless, event-driven pipeline for enriching images and videos using AWS services.

## Architecture

This service provides a fully event-driven, serverless pipeline for enriching images and videos using AWS services like Rekognition and Textract. The pipeline removes bespoke polling loops and provides a clean, scalable flow for both images and videos.

### Key Components

1. **EventBridge Custom Event Bus**: Entry point for all enrichment requests
2. **Image Pipeline**: Step Functions workflow for image enrichment
3. **Video Pipeline**: Step Functions workflow for video enrichment with callback pattern
4. **Monitoring & Error Handling**: Built-in CloudWatch Metrics, DLQs, and Step Functions error handling

### Workflow

1. **Ingestion – EventBridge Custom Event Bus**
   - Chronos publishes enrichment requests to EventBridge
   - Events are routed by `mediaType` to appropriate targets

2. **Image Pipeline – Step Functions "EnrichImage"**
   - EventBridge → SQS (ImageQueue) → Lambda (ImageOrchestrator) → Step Functions (EnrichImage)
   - Synchronously calls Rekognition & Textract for image analysis
   - Results are published to Chronos API

3. **Video Pipeline – Step Functions "EnrichVideo" with Callback Pattern**
   - EventBridge → Lambda (VideoStarter) → Step Functions (EnrichVideo)
   - Initiates async Rekognition Video jobs with TaskToken pattern
   - SQS → Lambda (CallbackReceiver) receives job completion and signals Step Functions
   - Results are assembled and published to Chronos API

## Deployment

The service is deployed using AWS CloudFormation/SAM. All resources are defined in `template.yaml`.

To deploy:

```bash
# Install AWS SAM CLI
pip install aws-sam-cli

# Build the application
sam build

# Deploy to AWS
sam deploy --guided
```

## Configuration

The following environment variables can be configured:

- `CHRONOS_API_URL`: URL of the Chronos API
- `ENRICHMENT_SERVICE_API_KEY`: API key for the Chronos API
- `ENABLE_FACE_DETECTION`: Enable face detection (true/false)
- `ENABLE_LABEL_DETECTION`: Enable label detection (true/false)
- `ENABLE_TEXT_DETECTION`: Enable text detection (true/false)
- `ENABLE_CELEBRITY_RECOGNITION`: Enable celebrity recognition (true/false)
- `ENABLE_CONTENT_MODERATION`: Enable content moderation (true/false)

## Event Format

To trigger an enrichment request, publish an event to the EventBridge bus:

```json
{
  "Source": "com.chronos.enricher",
  "DetailType": "EnrichmentRequested",
  "Detail": {
    "itemId": "unique-item-id",
    "mediaType": "image" | "video",
    "s3Bucket": "your-s3-bucket",
    "s3Key": "path/to/your/file.jpg"
  }
}
```

## Advantages Over Previous Architecture

- **Zero custom polling**: AWS manages all polling and callbacks
- **Fully managed orchestration**: Visual, auditable workflows via Step Functions
- **Feature-flag branching** built into the state machines
- **Automatic scaling** with event volume
- **Clear error paths** via DLQs, retries, and CloudWatch monitoring
- **Improved observability** with X-Ray tracing and CloudWatch metrics

## Integration with Chronos REST API

The Chronos REST API sends enrichment requests for:

1. Newly uploaded files (photos, videos, audio, documents)
2. Links and social media content

The enrichment service processes these items and calls back to the Chronos API with the results via the `/storage/enrichment/:id` endpoint.

## Development

To add/modify Lambda functions or state machines:

1. Update code in `lambdas/` directory
2. Update state machine definitions in `statemachines/` directory
3. Update `template.yaml` if necessary
4. Deploy using SAM

## Monitoring

Monitor the service using:

- CloudWatch Metrics
- Step Functions execution history
- SQS queue metrics
- Lambda CloudWatch Logs
- X-Ray traces 