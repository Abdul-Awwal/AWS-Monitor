terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# 1. Configure the AWS Provider
provider "aws" {
  region = "us-east-1"

  endpoints {
    sts = "https://sts.us-east-1.amazonaws.com"
  }
}

# 2. IAM Role
# This allows the Lambda service to assume this role.
resource "aws_iam_role" "remediation_role" {
  name = "security-remediation-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# 3. IAM Policy
# Grant the Lambda permission to:
# A. Create Logs (CloudWatch)
# B. Revoke Security Group Rules (The fix)
# C. Publish to SNS (The alert)
resource "aws_iam_role_policy" "remediation_policy" {
  name = "security-remediation-policy"
  role = aws_iam_role.remediation_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:DescribeSecurityGroups" 
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = "*"
      }
    ]
  })
}

# 4. The SNS Topic (For Alerts)
resource "aws_sns_topic" "alerts_topic" {
  name = "security-alerts-topic"
}

# 5. The Lambda Function 
resource "aws_lambda_function" "remediator" {
  filename      = "lambda.zip"         # Terraform cannot create an AWS Lambda function without a code package (zip file) present
  function_name = "security-remediator"
  role          = aws_iam_role.remediation_role.arn
  handler       = "lambda_function.lambda_handler" # filename.methodname
  runtime       = "python3.9"
  timeout       = 10

  # If the file changes, Terraform will update the function
  source_code_hash = filebase64sha256("lambda.zip")

  # Pass the SNS Topic ARN to the code as an environment variable
  environment {
    variables = {
      SNS_TOPIC_ARN = aws_sns_topic.alerts_topic.arn
    }
  }
}


# 6. EventBridge Rule
# specific event pattern to watch for Security Group changes
resource "aws_cloudwatch_event_rule" "sg_change_rule" {
  name        = "capture-sg-changes"
  description = "Triggers when a Security Group Ingress rule is modified"

  event_pattern = jsonencode({
    "source": ["aws.ec2"],
    "detail-type": ["AWS API Call via CloudTrail"],
    "detail": {
      "eventSource": ["ec2.amazonaws.com"],
      "eventName": [
        "AuthorizeSecurityGroupIngress", 
        "RevokeSecurityGroupIngress"
      ]
    }
  })
}

# 7. EventBridge Target
# Connects the Rule (Detective) to the Lambda (Enforcer)
resource "aws_cloudwatch_event_target" "target_lambda" {
  rule      = aws_cloudwatch_event_rule.sg_change_rule.name
  target_id = "SendToLambda"
  arn       = aws_lambda_function.remediator.arn
}

# 8. Lambda Permission=
# Explicitly allow EventBridge to trigger this specific function
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.remediator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.sg_change_rule.arn
}