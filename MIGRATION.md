# Terraform to Pulumi Migration Guide

## Overview

This document provides a detailed mapping between the original Terraform configuration and the new Pulumi TypeScript implementation for the AWS-Monitor security remediation system.

## File Structure Comparison

### Terraform (Original)
```
AWS-Monitor/
├── main.tf                    # Main infrastructure
├── vulnerable-resources.tf    # Test resources
└── lambda_function.py         # Lambda code
```

### Pulumi TypeScript (New)
```
AWS-Monitor/
├── index.ts                   # Main infrastructure (converted from main.tf)
├── vulnerable-resources.ts    # Test resources (converted from vulnerable-resources.tf)
├── lambda/
│   └── lambda_function.py     # Lambda code (packaged for deployment)
├── Pulumi.yaml                # Project configuration
├── Pulumi.dev.yaml            # Stack configuration
├── package.json               # Node.js dependencies
└── tsconfig.json              # TypeScript configuration
```

## Resource Mapping

### 1. AWS Provider Configuration

**Terraform (`main.tf`):**
```hcl
provider "aws" {
  region = "us-east-1"
  endpoints {
    sts = "https://sts.us-east-1.amazonaws.com"
  }
}
```

**Pulumi (`index.ts` + config):**
```typescript
// Set via: pulumi config set aws:region us-east-1
const region = aws.getRegionOutput().name;
```

### 2. IAM Role

**Terraform:**
```hcl
resource "aws_iam_role" "remediation_role" {
  name = "security-remediation-role"
  assume_role_policy = jsonencode({...})
}
```

**Pulumi:**
```typescript
const remediationRole = new aws.iam.Role("security-remediation-role", {
    name: "security-remediation-role",
    assumeRolePolicy: JSON.stringify({...}),
});
```

### 3. IAM Role Policy

**Terraform:**
```hcl
resource "aws_iam_role_policy" "remediation_policy" {
  name = "security-remediation-policy"
  role = aws_iam_role.remediation_role.id
  policy = jsonencode({...})
}
```

**Pulumi:**
```typescript
const remediationPolicy = new aws.iam.RolePolicy("security-remediation-policy", {
    name: "security-remediation-policy",
    role: remediationRole.id,
    policy: JSON.stringify({...}),
});
```

### 4. SNS Topic

**Terraform:**
```hcl
resource "aws_sns_topic" "alerts_topic" {
  name = "security-alerts-topic"
}
```

**Pulumi:**
```typescript
const alertsTopic = new aws.sns.Topic("security-alerts-topic", {
    name: "security-alerts-topic",
});
```

### 5. Lambda Function

**Terraform:**
```hcl
resource "aws_lambda_function" "remediator" {
  filename      = "lambda.zip"
  function_name = "security-remediator"
  role          = aws_iam_role.remediation_role.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  timeout       = 10
  source_code_hash = filebase64sha256("lambda.zip")
  environment {
    variables = {
      SNS_TOPIC_ARN = aws_sns_topic.alerts_topic.arn
    }
  }
}
```

**Pulumi:**
```typescript
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
```

**Key Differences:**
- Pulumi uses `FileArchive` to automatically package the Lambda directory
- No need for manual zip file creation or hash calculation
- Explicit dependency management with `dependsOn`

### 6. EventBridge Rule

**Terraform:**
```hcl
resource "aws_cloudwatch_event_rule" "sg_change_rule" {
  name        = "capture-sg-changes"
  description = "Triggers when a Security Group Ingress rule is modified"
  event_pattern = jsonencode({...})
}
```

**Pulumi:**
```typescript
const sgChangeRule = new aws.cloudwatch.EventRule("capture-sg-changes", {
    name: "capture-sg-changes",
    description: "Triggers when a Security Group Ingress rule is modified",
    eventPattern: JSON.stringify({...}),
});
```

### 7. EventBridge Target

**Terraform:**
```hcl
resource "aws_cloudwatch_event_target" "target_lambda" {
  rule      = aws_cloudwatch_event_rule.sg_change_rule.name
  target_id = "SendToLambda"
  arn       = aws_lambda_function.remediator.arn
}
```

**Pulumi:**
```typescript
const eventTarget = new aws.cloudwatch.EventTarget("target-lambda", {
    rule: sgChangeRule.name,
    targetId: "SendToLambda",
    arn: remediatorFunction.arn,
});
```

### 8. Lambda Permission

**Terraform:**
```hcl
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.remediator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.sg_change_rule.arn
}
```

**Pulumi:**
```typescript
const lambdaPermission = new aws.lambda.Permission("allow-eventbridge", {
    statementId: "AllowExecutionFromEventBridge",
    action: "lambda:InvokeFunction",
    function: remediatorFunction.name,
    principal: "events.amazonaws.com",
    sourceArn: sgChangeRule.arn,
});
```

### 9. Default VPC (Vulnerable Resources)

**Terraform:**
```hcl
resource "aws_default_vpc" "default" {
  tags = {
    Name = "Default VPC"
  }
}
```

**Pulumi:**
```typescript
const defaultVpc = aws.ec2.getVpc({
    default: true,
});
```

**Key Difference:**
- Pulumi uses a data source (`getVpc`) instead of a resource
- This is more appropriate as we're referencing, not creating, the default VPC

### 10. Vulnerable Security Group

**Terraform:**
```hcl
resource "aws_security_group" "bad_sg" {
  name        = "terraform-vulnerable-sg"
  description = "Intentionally vulnerable SG for testing"
  vpc_id      = aws_default_vpc.default.id
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Open to the world"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

**Pulumi:**
```typescript
export const vulnerableSg = new aws.ec2.SecurityGroup("terraform-vulnerable-sg", {
    name: "terraform-vulnerable-sg",
    description: "Intentionally vulnerable SG for testing",
    vpcId: defaultVpc.then(vpc => vpc.id),
    ingress: [{
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        description: "Open to the world",
    }],
    egress: [{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
    }],
});
```

## Outputs Comparison

**Terraform:**
```hcl
output "vulnerable_sg_id" {
  value = aws_security_group.bad_sg.id
}
```

**Pulumi:**
```typescript
export const vulnerableSgId = vulnerableResources.vulnerableSgId;
export const snsTopicArn = alertsTopic.arn;
export const lambdaFunctionName = remediatorFunction.name;
export const lambdaFunctionArn = remediatorFunction.arn;
export const eventRuleName = sgChangeRule.name;
export const awsRegion = region;
```

**Key Difference:**
- Pulumi exports are more comprehensive
- Values are automatically available via `pulumi stack output`

## Key Advantages of Pulumi

### 1. **Type Safety**
- TypeScript provides compile-time type checking
- IDE autocomplete and IntelliSense support
- Catch errors before deployment

### 2. **No Manual Packaging**
- `FileArchive` automatically packages Lambda code
- No need for separate zip creation or hash calculation
- Simplified deployment workflow

### 3. **Explicit Dependencies**
- Clear dependency management with `dependsOn`
- Automatic dependency inference from property references
- Better control over resource creation order

### 4. **Rich Outputs**
- Multiple exports for different use cases
- Easy access to resource properties
- Better integration with other tools

### 5. **Programming Language Features**
- Variables, loops, conditionals
- Functions and modules
- Reusable components

### 6. **State Management**
- Cloud-based state by default (Pulumi Cloud)
- Built-in state locking
- Team collaboration features
- Can use local state if preferred

## Command Comparison

| Task | Terraform | Pulumi |
|------|-----------|--------|
| Initialize | `terraform init` | `pulumi new` or project already initialized |
| Preview changes | `terraform plan` | `pulumi preview` |
| Apply changes | `terraform apply` | `pulumi up` |
| Destroy resources | `terraform destroy` | `pulumi destroy` |
| View outputs | `terraform output` | `pulumi stack output` |
| View state | `terraform show` | `pulumi stack` |

## Migration Checklist

- [x] Convert AWS provider configuration
- [x] Convert IAM role and policy
- [x] Convert SNS topic
- [x] Convert Lambda function
- [x] Convert EventBridge rule and target
- [x] Convert Lambda permission
- [x] Convert vulnerable resources
- [x] Set up Lambda code packaging
- [x] Configure AWS region
- [x] Add TypeScript compilation
- [ ] Configure AWS credentials
- [ ] Run `pulumi preview` to validate
- [ ] Deploy with `pulumi up`
- [ ] Test security remediation
- [ ] Update CI/CD pipelines (if any)

## Next Steps

1. **Configure AWS Credentials:**
   ```bash
   # Install AWS CLI
   sudo apt install awscli
   
   # Configure credentials
   aws configure
   ```

2. **Preview Infrastructure:**
   ```bash
   pulumi preview
   ```

3. **Deploy Infrastructure:**
   ```bash
   pulumi up
   ```

4. **Test the System:**
   - Create a vulnerable security group
   - Verify Lambda triggers and remediates
   - Check SNS notifications

5. **Clean Up Terraform State (Optional):**
   - After successful Pulumi deployment
   - Run `terraform destroy` to remove old resources
   - Archive Terraform files for reference
