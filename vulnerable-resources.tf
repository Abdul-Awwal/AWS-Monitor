# vulnerable_resources.tf

# 1. Get the Default VPC 
resource "aws_default_vpc" "default" {
  tags = {
    Name = "Default VPC"
  }
}

# 2. The Vulnerable Security Group
resource "aws_security_group" "bad_sg" {
  name        = "terraform-vulnerable-sg"
  description = "Intentionally vulnerable SG for testing"
  vpc_id      = aws_default_vpc.default.id

  # BAD RULE: Allow SSH (22) from ANY IP (0.0.0.0/0)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # <--- The Security Hole
    description = "Open to the world"
  }

  # Standard outbound rule (allow all traffic out)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Output the ID  of the vulnerable security group
output "vulnerable_sg_id" {
  value = aws_security_group.bad_sg.id
}