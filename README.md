# DocuSense.AI — Serverless AI Document Pipeline

![AWS](https://img.shields.io/badge/AWS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![Lambda](https://img.shields.io/badge/AWS_Lambda-FF9900?style=for-the-badge&logo=aws-lambda&logoColor=white)
![S3](https://img.shields.io/badge/Amazon_S3-569A31?style=for-the-badge&logo=amazons3&logoColor=white)
![DynamoDB](https://img.shields.io/badge/Amazon_DynamoDB-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white) 
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)

**DocuSense.AI** is a cloud-native, serverless, event-driven document analysis pipeline. Users can upload a PDF document directly to an Amazon S3 bucket, triggering a chain of serverless AWS Lambda microservices that clean and extract the text, analyze the content using OpenAI's `gpt-4o-mini`, and index the summary metadata in Amazon DynamoDB for real-time querying.

---

## 🏗️ Architecture
 
```
User React App -> [Request Presigned URL] -> API Gateway (Lambda Presign)
                                                | (returns upload url)
User React App -> [Direct Upload] ------------> S3 Upload Bucket
                                                | (s3:ObjectCreated trigger)
                                           Lambda Text Extractor (pypdf)
                                                | (saves clean text.txt)
                                           S3 Clean Text Bucket
                                                | (s3:ObjectCreated trigger)
                                           Lambda OpenAI Summarizer (GPT-4o-mini)
                                                | (writes metadata)
                                           DynamoDB Table & SNS
```

---

## 📂 Project Structure

```
serverless-ai-pipeline/
├── backend/
│   ├── presign/
│   │   └── app.py           # Lambda to generate S3 PUT presigned URLs
│   ├── extractor/
│   │   ├── app.py           # Lambda for PDF text extraction (pypdf)
│   │   └── requirements.txt # Python dependencies (pypdf)
│   ├── summarizer/
│   │   └── app.py           # Lambda calling OpenAI GPT-4o-mini (urllib)
│   └── status/
│       └── app.py           # Lambda returning processing results from DynamoDB
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Dashboard, file dropzone & status polling
│   │   ├── index.css        # Tailwind CSS import
│   │   └── main.tsx         # React app entry point
│   ├── tailwind.config.js
│   ├── vite.config.ts       # React/Vite bundler configuration
│   └── package.json
├── template.yaml            # AWS SAM Infrastructure template
└── README.md
```

---

## 🚀 Setup & Local Development

### Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed.
- [Docker](https://www.docker.com/) installed (required for running SAM local simulation).
- Node.js v20+ & Python 3.11+.
- OpenAI API Key.

### 1. Store your OpenAI API Key in AWS Systems Manager (SSM)

To run the pipeline securely, store your OpenAI API Key in the SSM Parameter Store. Run the following command in your terminal:

```bash
aws ssm put-parameter \
    --name "/docupipeline/openai_api_key" \
    --value "YOUR_OPENAI_API_KEY_HERE" \
    --type "SecureString" \
    --overwrite
```

### 2. Run the Backend Locally

Build the AWS SAM resources:
```bash
sam build
```

Start the API Gateway locally to mock the presigned URL and status endpoints:
```bash
sam local start-api
```
This runs a local HTTP server at `http://localhost:3000`.

### 3. Run the Frontend Locally

Navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Start the Vite development server:
```bash
npm run dev
```

Open your browser at `http://localhost:5173`. You can now drop a PDF, watch the console print direct uploads, and poll local status endpoints!

---

## ☁️ Deploy to AWS

Deploying the entire infrastructure is fully automated through AWS SAM.

1. **Build the latest project code:**
   ```bash
   sam build
   ```

2. **Deploy the stack to AWS:**
   ```bash
   sam deploy --guided
   ```
   Follow the interactive prompts to define your Stack Name, AWS Region, and confirm IAM role creation.

SAM will configure:
- The S3 buckets with CORS policies.
- The DynamoDB table.
- API Gateway Rest API.
- All Lambda functions and S3 trigger permissions.

Once deployed, SAM will output the `ApiEndpoint`. Copy this URL and set it as `VITE_API_ENDPOINT` in your frontend environment to connect it to the cloud!

---

## ⚡ Key Engineering Highlights

- **Direct S3 Uploads (Presigned URLs):** Avoids bottlenecking backend APIs by giving clients short-lived credentials to write files directly to S3.
- **Stateless PDF Parsing:** S3 acts as the event dispatcher and temporary queue storage, processing documents asynchronously without mounting persistent drives.
- **SSM Parameter Store Key Rotation:** Kept API secrets separate from code variables, storing them encrypted in the cloud.
- **Zero-Dependency summarizer Lambda:** Optimized cold-start times by making raw HTTP calls to OpenAI using Python's native `urllib` instead of packaging massive third-party packages.
