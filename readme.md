# ECS Microservices with Service Discovery and Path-Based Routing via Application Load Balancer

## 1. Install AWS ECS CLI

#### https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_CLI_installation.html

#### Set Up Env Vars

```bash
export AWS_ACCESS_KEY_ID=AKIAJQ4OFIYA72CGFGUA
export AWS_SECRET_ACCESS_KEY=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
export PROFILE_NAME=services-profile
export CLUSTER_NAME=services-cluster
export REGION=us-east-1
export CONFIG_NAME=services-config
export SECURITY_GROUP_NAME=services-sg
export LOAD_BALANCER_NAME=services-lb
export TARGET_GROUP_A_NAME=servicea-tg
export HEALTH_CHECK_PATH_A="/a/checka"
export TARGET_GROUP_B_NAME=serviceb-tg
export HEALTH_CHECK_PATH_B="/b/checkb"
export SERVICE_A_PATH="/a/*"
export SERVICE_B_PATH="/b/*"
export SERVICE_A_NAME=servicea
export SERVICE_B_NAME=serviceb
export DNS_NAMESPACE=services-ns
```

## 2. Configure the CLI

#### Set up a CLI profile

```bash
ecs-cli configure profile \
    --profile-name $PROFILE_NAME \
    --access-key $AWS_ACCESS_KEY_ID \
    --secret-key $AWS_SECRET_ACCESS_KEY
```

#### Configure the CLI profile

```bash
ecs-cli configure \
    --cluster $CLUSTER_NAME \
    --default-launch-type FARGATE \
    --region $REGION \
    --config-name $CONFIG_NAME && \
ecs-cli configure default --config-name $CONFIG_NAME
```

## 3. Create the Task Execution IAM Role

#### Create file `task-execution-assume-role.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

#### Create the Task Execution Role

```bash
aws iam --region $REGION create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file://task-execution-assume-role.json
```

#### Attach the Task Execution Role Policy

```bash
aws iam --region $REGION attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

## 4. Build Image & Push Code to Registry

#### Get a key to log in

```bash
$(aws ecr get-login --no-include-email)
```

#### Create the ECR Repository

```bash
export SERVICE_A_REPO=$(aws ecr create-repository \
    --repository-name servicea \
    --output text \
    --query 'repository.repositoryUri')
    
export SERVICE_B_REPO=$(aws ecr create-repository \
    --repository-name serviceb \
    --output text \
    --query 'repository.repositoryUri')
```

#### Build, Tag, and Push the Containers

```bash
cd ./servicea
docker build -t servicea .
docker tag servicea:latest $SERVICE_A_REPO:v1
docker push $SERVICE_A_REPO:v1

cd ../serviceb
docker build -t $SERVICE_B_NAME .
docker tag serviceb:latest $SERVICE_B_REPO:v1
docker push $SERVICE_B_REPO:v1
```

## 5. Create a Cluster and Security Group

#### Create the Cluster

- Creates an empty cluster and a VPC with 2 public subnets

```bash
ecs-cli up
# Take note of the VPC and subnets in the output from this command

export VPC_ID=vpc-0a83cc57a2aa04c91
export SUBNET_A_ID=subnet-0444ee83f3db5cc2f
export SUBNET_B_ID=subnet-01f074060df49a16e
```

#### Create the Security Groups

```bash
export SECURITY_GROUP_ID=$(aws ec2 create-security-group \
    --group-name $SECURITY_GROUP_NAME \
    --description "Services security group" \
    --vpc-id $VPC_ID \
    --output text \
    --query 'GroupId')
```

#### Add the Security Group Rule

```bash
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0
```

## 6. Create the Application Load Balancer and Target Groups

#### Application Load Balancer Setup

```bash
aws elbv2 create-load-balancer \
    --name $LOAD_BALANCER_NAME  \
    --subnets $SUBNET_A_ID $SUBNET_B_ID \
    --security-groups $SECURITY_GROUP_ID
```

```
# Take note of the load balancer ARN output

export LOAD_BALANCER_ARN=arn:aws:elasticloadbalancing:us-east-1:205375198116:loadbalancer/app/services-lb/412355024e7f7ea9
export DNS_NAME=services-lb-1076194052.us-east-1.elb.amazonaws.com
```

#### Target Groups Setup

```bash
# Service A Target Group
export TARGET_GROUP_A_ARN=$(aws elbv2 create-target-group \
    --name $TARGET_GROUP_A_NAME \
    --health-check-path $HEALTH_CHECK_PATH_A \
    --protocol HTTP \
    --port 80 \
    --target-type ip \
    --vpc-id $VPC_ID \
    --output text \
    --query 'TargetGroups[0].TargetGroupArn')
  


# Service B  Target Group
export TARGET_GROUP_B_ARN=$(aws elbv2 create-target-group \
    --name $TARGET_GROUP_B_NAME \
    --health-check-path $HEALTH_CHECK_PATH_B \
    --protocol HTTP \
    --port 80 \
    --target-type ip \
    --vpc-id $VPC_ID \
    --output text \
    --query 'TargetGroups[0].TargetGroupArn')
```

#### Setup Listener

```bash
export LISTENER_ARN=$(aws elbv2 create-listener \
    --load-balancer-arn $LOAD_BALANCER_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type='fixed-response',FixedResponseConfig="{MessageBody=ohai,StatusCode=200,ContentType='text/plain'}" \
    --output text \
    --query 'Listeners[0].ListenerArn')
```

```
# Take note of the listener ARN in the output of the command
```

#### Create Rules for Each Service

```bash
# Service A
export RULE_A_ARN=$(aws elbv2 create-rule \
    --listener-arn $LISTENER_ARN \
    --priority 10 \
    --conditions Field=path-pattern,Values=$SERVICE_A_PATH \
    --actions Type=forward,TargetGroupArn=$TARGET_GROUP_A_ARN \
    --output text \
    --query 'Rules[0].RuleArn')

# Service b
export RULE_B_ARN=$(aws elbv2 create-rule \
    --listener-arn $LISTENER_ARN \
    --priority 11 \
    --conditions Field=path-pattern,Values=$SERVICE_B_PATH \
    --actions Type=forward,TargetGroupArn=$TARGET_GROUP_B_ARN \
    --output text \
    --query 'Rules[0].RuleArn')
    ```

## 6. Set Up Services

```bash
ecs-cli compose --project-name $SERVICE_A_NAME service up \
    --private-dns-namespace $DNS_NAMESPACE \
    --enable-service-discovery \
    --container-name $SERVICE_A_NAME \
    --container-port 80 \
    --create-log-groups \
    --target-group-arn $TARGET_GROUP_A_ARN \
    --vpc $VPC_ID 
    
ecs-cli compose --project-name $SERVICE_B_NAME service up \
    --private-dns-namespace $DNS_NAMESPACE \
    --enable-service-discovery \
    --container-name $SERVICE_B_NAME \
    --container-port 80 \
    --create-log-groups \
    --target-group-arn $TARGET_GROUP_B_ARN \
    --vpc $VPC_ID 
```

## 7. Update

```bash
# After code changes
cd ../servicea
docker build -t $SERVICE_A_NAME .
docker tag servicea:latest $SERVICE_A_REPO:latest
docker push $SERVICE_A_REPO:latest
aws ecs update-service \
    --service $SERVICE_A_NAME \
    --cluster $CLUSTER_NAME \
    --force-new-deployment \
    --desired-count 1

cd ../serviceb
docker build -t $SERVICE_B_NAME .
docker tag serviceb:latest $SERVICE_B_REPO:latest
docker push $SERVICE_B_REPO:latest
aws ecs update-service \
    --service $SERVICE_B_NAME \
    --cluster $CLUSTER_NAME \
    --force-new-deployment \
    --desired-count 1
```

## 8. Tear Down

```bash
ecs-cli compose service down && cd ../serviceb && ecs-cli compose service down
ecs-cli down --force --cluster-config $CONFIG_NAME
```
