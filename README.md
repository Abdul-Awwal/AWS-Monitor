## ABOUT:
A serverless DevSecOps framework that automatically detects and remediates security misconfigurations in real-time. This project enforces "Least Privilege" by detecting resource changes via AWS EventBridge, validating and instantly revoking changes via AWS Lambda, and alerting the security team via AWS SNS.

> **Note:** This project has been converted from Terraform to Pulumi with TypeScript. See [MIGRATION.md](MIGRATION.md) for details.

## Functional Requirements:
- System must continuously monitor the AWS environment for changes to Security Group configurations
- Upon detecting a change, the system must programmatically inspect the specific security group rule to determine if it violates security policy
- If a violation is confirmed, the system must immediately revoke the non-compliant rule
- The security team must be immediately notified whenever a remediation action occurs or a warning is issued

## Product Flowchart:
<img width="701" height="716" alt="image" src="https://github.com/user-attachments/assets/167a9952-b80b-4638-94c9-66ca289a1aa5" />

## Technology:
- **Infrastructure as Code:** Pulumi with TypeScript (previously Terraform)
- **Cloud Provider:** AWS (Lambda, EventBridge, IAM, CloudTrail, SNS, EC2)
- **Language:** Python 3.9 (Lambda), TypeScript (Infrastructure)
- **Concepts:** Event-Driven Architecture, Serverless, Real-time Compliance

## Application Breakdown:
- **Infrastructure:** Pulumi provisions the entire stack (IAM roles, Lambda function, SNS Topic, EventBridge rules)
- **Detection:** EventBridge monitors CloudTrail for `AuthorizeSecurityGroupIngress` API calls
- **Analysis:** The Python Lambda function parses the JSON payload to inspect the specific Security Group rules
- **Remediation:** If a rule allows `0.0.0.0/0` on Port 22, the Lambda revokes it immediately using the `boto3` library
- **Alerting:** An email notification is sent to the administrator detailing the violation and the user responsible

## Getting Started

### Prerequisites
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/) (>= v3.0)
- [Node.js](https://nodejs.org/) (>= v18)
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- AWS account with appropriate permissions

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Abdul-Awwal/AWS-Monitor.git
   cd AWS-Monitor
   git checkout pulumi-typescript-conversion
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure AWS credentials:**
   ```bash
   aws configure
   ```

4. **Set AWS region (if different from us-east-1):**
   ```bash
   pulumi config set aws:region us-east-1
   ```

### Deployment

1. **Preview the infrastructure changes:**
   ```bash
   pulumi preview
   # or use npm script
   npm run preview
   ```

2. **Deploy the infrastructure:**
   ```bash
   pulumi up
   # or use npm script
   npm run up
   ```

3. **View stack outputs:**
   ```bash
   pulumi stack output
   ```

### Testing

1. **Create a vulnerable security group** through the AWS Console or CLI:
   ```bash
   aws ec2 authorize-security-group-ingress \
     --group-id <your-sg-id> \
     --protocol tcp \
     --port 22 \
     --cidr 0.0.0.0/0
   ```

2. **Monitor the remediation:**
   - Check CloudTrail logs for the `RevokeSecurityGroupIngress` event
   - View Lambda execution logs in CloudWatch
   - Verify email notification from SNS

### Cleanup

To destroy all resources:
```bash
pulumi destroy
# or use npm script
npm run destroy
```

## Project Structure

```
AWS-Monitor/
├── index.ts                   # Main infrastructure code
├── vulnerable-resources.ts    # Test resources (vulnerable SG)
├── lambda/
│   └── lambda_function.py     # Lambda remediation logic
├── Pulumi.yaml                # Pulumi project configuration
├── Pulumi.dev.yaml            # Stack-specific configuration
├── package.json               # Node.js dependencies
├── tsconfig.json              # TypeScript configuration
├── MIGRATION.md               # Terraform to Pulumi migration guide
└── README.md                  # This file
```

## Stack Outputs

After deployment, the following outputs are available:

```bash
pulumi stack output
```

- `snsTopicArn` - ARN of the SNS topic for alerts
- `lambdaFunctionName` - Name of the Lambda function
- `lambdaFunctionArn` - ARN of the Lambda function
- `eventRuleName` - Name of the EventBridge rule
- `awsRegion` - AWS region where resources are deployed
- `vulnerableSgId` - ID of the test vulnerable security group

## Demo Screenshots:

1. Creating a vulnerable security group through Security Groups on the EC2 service:
<img width="704" height="202" alt="image" src="https://github.com/user-attachments/assets/67ae0232-7cb4-4989-87cc-1e12fafec16b" />

2. Checking CloudTrail logs to show event (RevokeSecurityGroup) performed by security-remediator:
<img width="703" height="83" alt="image" src="https://github.com/user-attachments/assets/841e415d-eb69-4f75-ba2a-3412dbd7e821" />

3. Lambda execution logs verifying the automated detection and remediation logic:
<img width="704" height="80" alt="image" src="https://github.com/user-attachments/assets/ea0434c2-ae5a-4714-9a8b-2b24fc42eb32" />

4. Email screenshot showing successful AWS Simple Notification Service (SNS) execution:
<img width="746" height="313" alt="image" src="https://github.com/user-attachments/assets/28e79c96-efb6-43f4-a2b2-ae21190a82e2" />

## Testing Results:

| S. NO | Action | Input | Expected Output | Actual Output | Test Result | Notes/Comments |
| ----- | ------ | ----- | --------------- | ------------- | ----------- | -------------- |
| 1 | Configure AWS credentials | `aws configure`<br>`aws sts get-caller-identity` | ARN line should end with expected user | ARN line ended with expected user | Pass | |
| 2 | Deploy infrastructure with Pulumi | `pulumi up` | Apply complete, resources reflect on AWS Console | Resources created successfully | Pass | Converted from Terraform to Pulumi |
| 3 | Create Security Group rule allowing SSH traffic from any IP | Configured via AWS Console | Rule successfully added | Rule successfully added | Pass | |
| 4 | Security Group rule should automatically be deleted after ~5 seconds | None | Rule deleted, RevokeSecurityGroup event in CloudTrail | Rule deleted, RevokeSecurityGroup event in CloudTrail | Pass | EventBridge triggers Lambda automatically |

## Available NPM Scripts

```bash
npm run build      # Compile TypeScript
npm run preview    # Preview infrastructure changes
npm run up         # Deploy infrastructure
npm run destroy    # Destroy all resources
```

## Useful Pulumi Commands

```bash
pulumi stack                    # View current stack information
pulumi stack output             # View all outputs
pulumi stack output <name>      # View specific output
pulumi logs                     # View logs from Lambda executions
pulumi refresh                  # Refresh state to match actual resources
pulumi stack export             # Export stack state
```

## Migration from Terraform

This project was originally built with Terraform and has been migrated to Pulumi with TypeScript. Key benefits of this migration:

- **Type Safety:** TypeScript provides compile-time type checking
- **Better IDE Support:** IntelliSense and autocomplete
- **No Manual Packaging:** Automatic Lambda code packaging
- **Explicit Dependencies:** Clear resource dependency management
- **Rich Outputs:** Multiple exports for different use cases

For detailed migration information, see [MIGRATION.md](MIGRATION.md).

## Future Works:
- Currently, this system is only limited to security group misconfigurations. Future work includes expanding it to cover more resources and exploring better alternatives for DevSecOps
- Add support for other security violations (e.g., S3 bucket policies, IAM policies)
- Implement automated testing with Pulumi's testing framework
- Add CI/CD pipeline for automated deployments
- Create reusable Pulumi components for common security patterns

## Resources

- [Pulumi Documentation](https://www.pulumi.com/docs/)
- [Pulumi AWS Provider](https://www.pulumi.com/registry/packages/aws/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS EventBridge Documentation](https://docs.aws.amazon.com/eventbridge/)
