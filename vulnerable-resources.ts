import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// 1. Get the Default VPC
const defaultVpc = aws.ec2.getVpc({
    default: true,
});

// 2. Create a Vulnerable Security Group for Testing
// This intentionally has a bad rule (SSH open to the world)
export const vulnerableSg = new aws.ec2.SecurityGroup("terraform-vulnerable-sg", {
    name: "terraform-vulnerable-sg",
    description: "Intentionally vulnerable SG for testing",
    vpcId: defaultVpc.then(vpc => vpc.id),

    // BAD RULE: Allow SSH (22) from ANY IP (0.0.0.0/0)
    ingress: [{
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"], // <--- The Security Hole
        description: "Open to the world",
    }],

    // Standard outbound rule (allow all traffic out)
    egress: [{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
    }],
});

// Output the ID of the vulnerable security group
export const vulnerableSgId = vulnerableSg.id;
