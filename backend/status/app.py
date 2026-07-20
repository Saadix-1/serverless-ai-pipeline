import json
import os 
import boto3 
 
dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    table_name = os.environ.get('METADATA_TABLE')
    table = dynamodb.Table(table_name)
    
    # Extract path parameters
    path_parameters = event.get('pathParameters') or {}
    document_id = path_parameters.get('id')
    
    if not document_id:
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Document ID is required'})
        }
        
    try:
        # Query DynamoDB
        response = table.get_item(Key={'document_id': document_id})
        item = response.get('Item')
        
        if not item:
            # If not in DynamoDB yet, it might still be in the extraction/processing stage.
            # Return status PENDING
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                'body': json.dumps({
                    'document_id': document_id,
                    'status': 'PROCESSING',
                    'message': 'Document is currently being processed.'
                })
            }
            
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps(item)
        }
        
    except Exception as e:
        print(f"Error fetching document status: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Failed to fetch document status'})
        }
