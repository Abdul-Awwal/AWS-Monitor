import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as fs from "fs";
import * as path from "path";

// Import vulnerable resources for testing
import * as vulnerableResources from "./vulnerable-resources";


// Get the current AWS region
const region = aws.getRegionOutput().name;

// 1. IAM Role for Lambda
// This allows the Lambda service to assume this role
const remediationRole = new aws.iam.Role("security-remediation-role", {
    name: "security-remediation-role",
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "lambda.amazonaws.com",
            },
        }],
    }),
});

// 2. IAM Policy for Lambda
// Grant permissions for CloudWatch Logs, EC2 Security Groups, and SNS
const remediationPolicy = new aws.iam.RolePolicy("security-remediation-policy", {
    name: "security-remediation-policy",
    role: remediationRole.id,
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                ],
                Resource: "arn:aws:logs:*:*:*",
            },
            {
                Effect: "Allow",
                Action: [
                    "ec2:RevokeSecurityGroupIngress",
                    "ec2:AuthorizeSecurityGroupIngress",
                    "ec2:DescribeSecurityGroups",
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: ["sns:Publish"],
                Resource: "*",
            },
        ],
    }),
});

// 3. SNS Topic for Security Alerts
const alertsTopic = new aws.sns.Topic("security-alerts-topic", {
    name: "security-alerts-topic",
});

// 4. Lambda Function
// Create a Lambda function from the Python code
const remediatorFunction = new aws.lambda.Function("security-remediator", {
    name: "security-remediator",
    runtime: aws.lambda.Runtime.Python3d9,
    handler: "lambda_function.lambda_handler",
    role: remediationRole.arn,
    timeout: 10,
    code: new pulumi.asset.FileArchive("./lambda"),
    environment: {
        variables: {
            SNS_TOPIC_ARN: alertsTopic.arn,
        },
    },
}, { dependsOn: [remediationPolicy] });

// 5. EventBridge Rule
// Watch for Security Group changes
const sgChangeRule = new aws.cloudwatch.EventRule("capture-sg-changes", {
    name: "capture-sg-changes",
    description: "Triggers when a Security Group Ingress rule is modified",
    eventPattern: JSON.stringify({
        source: ["aws.ec2"],
        "detail-type": ["AWS API Call via CloudTrail"],
        detail: {
            eventSource: ["ec2.amazonaws.com"],
            eventName: [
                "AuthorizeSecurityGroupIngress",
                "RevokeSecurityGroupIngress",
            ],
        },
    }),
});

// 6. EventBridge Target
// Connect the EventBridge rule to the Lambda function
const eventTarget = new aws.cloudwatch.EventTarget("target-lambda", {
    rule: sgChangeRule.name,
    targetId: "SendToLambda",
    arn: remediatorFunction.arn,
});

// 7. Lambda Permission
// Allow EventBridge to invoke the Lambda function
const lambdaPermission = new aws.lambda.Permission("allow-eventbridge", {
    statementId: "AllowExecutionFromEventBridge",
    action: "lambda:InvokeFunction",
    function: remediatorFunction.name,
    principal: "events.amazonaws.com",
    sourceArn: sgChangeRule.arn,
});

// Export important values
export const snsTopicArn = alertsTopic.arn;
export const lambdaFunctionName = remediatorFunction.name;
export const lambdaFunctionArn = remediatorFunction.arn;
export const eventRuleName = sgChangeRule.name;
export const awsRegion = region;
export const vulnerableSgId = vulnerableResources.vulnerableSgId;

