import boto3
import json
import os

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    sns = boto3.client('sns') # <---Client for notifications
    
    # Get the SNS Topic ARN from the environment variable (set in Terraform)
    sns_topic_arn = os.environ['SNS_TOPIC_ARN']

    try:
        detail = event.get('detail', {})
        request_params = detail.get('requestParameters', {})
        group_id = request_params.get('groupId')
        
        # Capture the User Identity (Who did this?)
       
        user_identity = detail.get('userIdentity', {})
        user_arn = user_identity.get('arn', 'Unknown User')

        if not group_id:
            print("No Security Group ID found.")
            return

        print(f"Investigating Security Group: {group_id}")

        # Inspect the Security Group
        response = ec2.describe_security_groups(GroupIds=[group_id])
        security_group_rules = response['SecurityGroups'][0]['IpPermissions']

        for rule in security_group_rules:
            from_port = rule.get('FromPort')
            to_port = rule.get('ToPort')
            
            if from_port == 22 and to_port == 22:
                for ip_range in rule.get('IpRanges', []):
                    if ip_range.get('CidrIp') == '0.0.0.0/0':
                        
                        print(f"VIOLATION: SG {group_id} has Port 22 open to world.")
                        
                        # 1. REMEDIATE
                        ec2.revoke_security_group_ingress(
                            GroupId=group_id,
                            IpPermissions=[rule]
                        )
                        print(f"REMEDIATED: Revoked rule.")
                        
                        # 2. NOTIFY 
                        message = (
                            f"🚨 SECURITY ALERT 🚨\n\n"
                            f"Violation: SSH (Port 22) opened to the entire world (0.0.0.0/0).\n"
                            f"Resource: {group_id}\n"
                            f"Action: REMEDIATED (Rule was automatically deleted).\n"
                            f"User Responsible: {user_arn}\n"
                        )
                        
                        sns.publish(
                            TopicArn=sns_topic_arn,
                            Message=message,
                            Subject="Auto-Remediation Alert: Security Group Violation"
                        )
                        
                        return {
                            'statusCode': 200,
                            'body': json.dumps('Violation Remediated and Alert Sent!')
                        }

        return {
            'statusCode': 200,
            'body': json.dumps('No violation found.')
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"Error: {str(e)}")
        }