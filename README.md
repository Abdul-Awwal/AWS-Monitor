# AWS-Monitor — Serverless Security Auto-Remediation

A serverless DevSecOps framework that detects and remediates AWS security misconfigurations in near real-time. When someone opens SSH (port 22) to the world on a Security Group, the system detects the change via CloudTrail + EventBridge, automatically revokes the offending rule with Lambda, and alerts the security team through SNS — typically within seconds, with no human intervention.

**Stack:** Terraform · Python 3.9 (Boto3) · AWS Lambda · EventBridge · CloudTrail · SNS · IAM

## How It Works

```
Security Group change ──> CloudTrail ──> EventBridge rule ──> Lambda ──┬──> Revoke rule (EC2)
   (AuthorizeSecurityGroupIngress)                                     └──> Alert team (SNS email)
```

1. **Detection** — CloudTrail records every `AuthorizeSecurityGroupIngress` / `RevokeSecurityGroupIngress` API call. An EventBridge rule matches these events and invokes the Lambda function.
2. **Analysis** — The Lambda (`lambda_function.py`) describes the affected Security Group and inspects each ingress rule for the policy violation: **port 22 open to `0.0.0.0/0`**.
3. **Remediation** — If a violation is confirmed, the Lambda immediately calls `revoke_security_group_ingress` to delete the non-compliant rule.
4. **Alerting** — An SNS notification is published to the security team identifying the resource, the violation, the action taken, and the IAM identity responsible (pulled from the CloudTrail event's `userIdentity`).

### Architecture Flowchart

<img width="701" height="716" alt="Architecture flowchart" src="https://github.com/user-attachments/assets/167a9952-b80b-4638-94c9-66ca289a1aa5" />

## Repository Structure

| File | Purpose |
| --- | --- |
| `main.tf` | Provisions the full stack: IAM role + least-privilege policy, Lambda function, SNS topic, EventBridge rule/target, and the Lambda invoke permission |
| `lambda_function.py` | Detection, remediation, and alerting logic (Boto3) |
| `vulnerable-resources.tf` | Intentionally misconfigured test resources used to validate the pipeline |

## Deployment

**Prerequisites:** Terraform, AWS CLI configured (`aws configure`), and an AWS account.

```bash
# 1. Package the Lambda code (Terraform expects lambda.zip)
zip lambda.zip lambda_function.py

# 2. Deploy the stack
terraform init
terraform plan
terraform apply
```

> **Note:** Make sure the region in `main.tf` matches the region set in `aws configure`, and subscribe an email address to the `security-alerts-topic` SNS topic to receive alerts. EventBridge also requires a CloudTrail trail that logs **Write** management events — see test #8 below for how this surfaced during testing.

## Demo

1. Creating a vulnerable Security Group rule (SSH open to the world) via the EC2 console:

<img width="704" height="202" alt="Creating a vulnerable security group rule" src="https://github.com/user-attachments/assets/67ae0232-7cb4-4989-87cc-1e12fafec16b" />

2. CloudTrail logs showing the `RevokeSecurityGroup` event performed automatically by `security-remediator`:

<img width="703" height="83" alt="CloudTrail revoke event" src="https://github.com/user-attachments/assets/841e415d-eb69-4f75-ba2a-3412dbd7e821" />

3. Lambda execution logs verifying the automated detection and remediation logic:

<img width="704" height="80" alt="Lambda execution logs" src="https://github.com/user-attachments/assets/ea0434c2-ae5a-4714-9a8b-2b24fc42eb32" />

4. SNS email alert confirming the remediation and identifying the responsible user:

<img width="746" height="313" alt="SNS email alert" src="https://github.com/user-attachments/assets/28e79c96-efb6-43f4-a2b2-ae21190a82e2" />

## Testing

End-to-end test log, including failures encountered and how they were resolved:

| # | Action | Input | Expected Output | Actual Output | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Connect to AWS via provisioned dev user | `aws configure`, `aws sts get-caller-identity` | ARN ends with expected user `AbdulDev` | ARN ended with expected user | ✅ Pass | |
| 2 | `terraform plan` / `apply` to provision the stack | Terraform CLI | Apply complete; resources visible in console | STS credential validation error: `dial tcp: lookup sts.us-east-1.amazonaws.com ... no such host` | ❌ Fail | Region in `main.tf` didn't match the region set in `aws configure`. Aligned the regions and re-ran. |
| 3 | `terraform plan` / `apply` (retry) | Terraform CLI | Apply complete | `Apply complete! Resources: 4 added, 0 changed, 0 destroyed.` | ✅ Pass | |
| 4 | Create SG rule allowing SSH from any IP | AWS Console | Rule added | Rule added | ✅ Pass | |
| 5 | Rule auto-deleted within ~5 seconds | None | Rule deleted; `RevokeSecurityGroup` in CloudTrail | Rule was **not** deleted; no event created | ❌ Fail | Investigated below. |
| 6 | Manually invoke Lambda with a test event | Test event with `AuthorizeSecurityGroupIngress` + real SG ID | Rule deleted | Rule deleted | ✅ Pass | Ruled out a Lambda permissions issue — the function worked; the trigger didn't. |
| 7 | Create SG rule allowing SSH from any IP | AWS Console | Rule added | Rule added | ✅ Pass | |
| 8 | Rule auto-deleted within ~5 seconds | None | Rule deleted; `RevokeSecurityGroup` in CloudTrail | Rule deleted; event in CloudTrail | ✅ Pass | **Root cause of #5:** a missing link between CloudTrail and EventBridge. Creating a CloudTrail trail configured to log and export **Write** management events established the event pipeline, allowing EventBridge to detect the API call and trigger the Lambda automatically. |

## Future Work

- Expand coverage beyond Security Group misconfigurations to other resource types (e.g., public S3 buckets, overly permissive IAM policies).
- Make the policy rules configurable (ports, CIDR ranges) rather than hardcoded.
- Add automated tests and CI for the Lambda logic.
