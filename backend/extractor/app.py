import io
import os
import urllib.parse
import boto3
from pypdf import PdfReader

s3 = boto3.client('s3')

def lambda_handler(event, context):
    clean_text_bucket = os.environ.get('CLEAN_TEXT_BUCKET')
    
    # Get bucket name and file key from the S3 event
    record = event['Records'][0]
    bucket = record['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(record['s3']['object']['key'], encoding='utf-8')
    
    print(f"Triggered by new PDF: {bucket}/{key}")
    
    try:
        # 1. Download PDF from S3 in memory
        response = s3.get_object(Bucket=bucket, Key=key)
        pdf_bytes = response['Body'].read()
        
        # 2. Parse PDF and extract text using pypdf
        reader = PdfReader(io.BytesIO(pdf_bytes))
        extracted_text = ""
        
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                extracted_text += f"--- Page {i + 1} ---\n{page_text}\n"
                
        # Handle empty PDF edge case
        if not extracted_text.strip():
            extracted_text = "Warning: No readable text found in this PDF."
            
        # 3. Create destination text file key (replacing .pdf with .txt)
        txt_key = key.replace('.pdf', '.txt')
        
        # 4. Upload the clean text back to S3
        s3.put_object(
            Bucket=clean_text_bucket,
            Key=txt_key,
            Body=extracted_text.encode('utf-8'),
            ContentType='text/plain'
        )
        
        print(f"Successfully extracted text and uploaded to: {clean_text_bucket}/{txt_key}")
        
        return {
            'statusCode': 200,
            'body': f"Extracted text successfully saved to {txt_key}"
        }
        
    except Exception as e:
        print(f"Error extracting text from PDF: {str(e)}")
        raise e
