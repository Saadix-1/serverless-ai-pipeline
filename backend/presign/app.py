import json
import os
import uuid
import boto3
from botocore.config import Config

s3_client = boto3.client('s3', config=Config(signature_version='s3v4'))

def lambda_handler(event, context):
    upload_bucket = os.environ.get('UPLOAD_BUCKET')
    
    # Query parameters (e.g., filename)
    query_params = event.get('queryStringParameters') or {}
    filename = query_params.get('filename', 'document.pdf')
    
    # Check that file is a PDF
    if not filename.endswith('.pdf'):
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Only PDF uploads are allowed'})
        }
    
    # Generate a unique key for the S3 object
    file_uuid = str(uuid.uuid4())
    object_key = f"uploads/{file_uuid}_{filename}"
    
    try:
        # Generate the presigned URL for PUT request
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': upload_bucket,
                'Key': object_key,
                'ContentType': 'application/pdf'
            },
            ExpiresIn=3600 # URL valid for 1 hour
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({
                'upload_url': presigned_url,
                'key': object_key
            })
        }
        
    except Exception as e:
        print(f"Error generating presigned URL: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Failed to generate upload URL'})
        }
