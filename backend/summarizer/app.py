import json
import os
import urllib.request
import urllib.parse
import datetime
import boto3

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
ssm = boto3.client('ssm')

def get_openai_api_key():
    # Fetch API Key from SSM Parameter Store
    param_name = "/docupipeline/openai_api_key"
    try:
        response = ssm.get_parameter(Name=param_name, WithDecryption=True)
        return response['Parameter']['Value']
    except Exception as e:
        print(f"Error fetching API key from SSM: {str(e)}")
        # In local testing or fallback, we can also check environment variables
        return os.environ.get('OPENAI_API_KEY')

def query_openai(api_key, text_content):
    # Truncate text content to avoid context window limits (e.g. ~10k characters)
    max_chars = 12000
    truncated_text = text_content[:max_chars]
    
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Prompting for a structured JSON response
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": "You are an expert AI document analyzer. You must respond ONLY with a valid JSON object. Do not include markdown formatting or backticks in your output."
            },
            {
                "role": "user",
                "content": (
                    "Analyze the following document text and return a JSON object with exactly these fields:\n"
                    "- 'title': A short descriptive title for the document\n"
                    "- 'summary': A concise 3-4 sentence summary of the main points\n"
                    "- 'action_items': A list of key tasks, actions, or takeaways (max 5 items)\n"
                    "- 'keywords': A list of 4-5 relevant indexing terms/tags\n\n"
                    f"Document text:\n{truncated_text}"
                )
            }
        ],
        "response_format": {"type": "json_object"}
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            content_str = res_json['choices'][0]['message']['content']
            return json.loads(content_str)
    except Exception as e:
        print(f"Error calling OpenAI API: {str(e)}")
        # Return a fallback JSON if API call fails
        return {
            "title": "Analysis Failed",
            "summary": "Could not generate summary due to API error.",
            "action_items": ["Verify OpenAI API key", "Check API limits/billing status"],
            "keywords": ["error", "api-failure"]
        }

def lambda_handler(event, context):
    table_name = os.environ.get('METADATA_TABLE')
    table = dynamodb.Table(table_name)
    
    # Get S3 object info
    record = event['Records'][0]
    bucket = record['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(record['s3']['object']['key'], encoding='utf-8')
    
    print(f"Triggered by new Text file: {bucket}/{key}")
    
    try:
        # 1. Download the clean text file
        response = s3.get_object(Bucket=bucket, Key=key)
        text_content = response['Body'].read().decode('utf-8')
        
        # 2. Get OpenAI API Key from Parameter Store
        api_key = get_openai_api_key()
        if not api_key:
            print("SSM parameter '/docupipeline/openai_api_key' not found and no environment variable. Using empty key.")
            
        # 3. Call OpenAI for analysis
        analysis = query_openai(api_key, text_content)
        
        # 4. Generate document ID and filename
        # key format: 'uploads/uuid_filename.txt' -> extract original filename
        filename = os.path.basename(key)
        if "_" in filename:
            filename = filename.split("_", 1)[1].replace('.txt', '.pdf')
        else:
            filename = filename.replace('.txt', '.pdf')
            
        document_id = key.replace('.txt', '').replace('uploads/', '')
        
        # 5. Write to DynamoDB
        item = {
            'document_id': document_id,
            'filename': filename,
            'title': analysis.get('title', filename),
            'summary': analysis.get('summary', 'No summary available.'),
            'action_items': analysis.get('action_items', []),
            'keywords': analysis.get('keywords', []),
            'processed_at': datetime.datetime.utcnow().isoformat(),
            'status': 'COMPLETED'
        }
        
        table.put_item(Item=item)
        print(f"Successfully processed document and saved to DynamoDB: {document_id}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Document successfully summarized', 'document_id': document_id})
        }
        
    except Exception as e:
        print(f"Error in AI Summarizer: {str(e)}")
        # Try to log failure in DynamoDB if possible
        try:
            document_id = key.replace('.txt', '').replace('uploads/', '')
            table.put_item(Item={
                'document_id': document_id,
                'filename': key,
                'status': 'FAILED',
                'error': str(e),
                'processed_at': datetime.datetime.utcnow().isoformat()
            })
        except Exception as db_err:
            print(f"Could not write failure to DynamoDB: {str(db_err)}")
        raise e
