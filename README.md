# DOCUMENTATION

## SUMMARY
EC2 runtime monitor is a serverless solution to get a notification when an EC2 instance is running for a time exceeding a user defined threshold.


## USE CASE
The main use case is to notify cloud workstation user to make sure they stop the EC2 instances when they don't use it. Some instance usage like video editing requires expensive and powerful instances with a higher carbon footprint. User works with these instances as a workstation. They can launch long-running processes like rendering, work late, have long-working periods (>12h), take pause ...  
Their behavior do not respect any pattern nor do not correlate with any performance metric ( CPU, RAM usage ).  
It's not possible to predict when the instance could be stopped to save cost/eCO2 and it's not acceptable to stop the instance without user consent.  
In this context, it is relevant to notify users about the instance runtime to remind them the opportunity to save cost/eCO2.  
Users can decide to stop the instance if possible.   


## DESIGN
This solution is divided into 2 main parts :
1) An event based mechanism to detect instance creation and deletion :
    - Specific event from EC2 service are captured by an EventBridge rule ( "running" and "terminated" instance states )
    - The EventTarget is a StepFunction.
    - This StepFunction use EC2 DescribeTags action to inspect the instance tags and adapt its behavior ( Instance tags can replace default function parameters )
    - This StepFunction use a DynamoDB table to implement idempotence based on EC2 instance ID.
    - At instance creation, this StepFunction is triggered and create an EventBridge Scheduler rule to monitor the instance runtime at regular frequency.
    - At instance deletion, this StepFunction is triggered and delete the corresponding EventBridge Scheduler rule to stop monitoring the instance runtime.

2) A CRON based monitoring process 
    - This is a second StepFunction triggered by the EventBridge Scheduler rule mentioned in the first part.
    - The StepFunction use the EC2 DescribeInstances action to retrieve instance information including the launch time.
    - The StepFunction leverage the instance launch time and current time to find the instance runtime and compare it with a user defined threshold.
    - If the runtime exceed this threshold, the StepFunction publish a message on a dedicated SNS topic. 


## INSTALLATION
The solution is delivered as a TF module with the necessary asset ( Lambda and StepFunction definition ).  
This module can be used in any TF stack.
This module does not set any provider but define provider requirements :
- "aws" -> ">= 5.31.0"  
- "archive" -> ">= 2.4.1"   

If not used from a TF stack, the module can rely on the default provider configuration.  
The AWS provider default config rely on the following environment variables :
- AWS_DEFAULT_REGION  
- AWS_ACCESS_KEY_ID  
- AWS_SECRET_ACCESS_KEY  
- AWS_SESSION_TOKEN ( Optional )  

Open a terminal,  
Set these env with the "export" command :
```
export AWS_DEFAULT_REGION=XXX  
export AWS_ACCESS_KEY_ID=XXX  
export AWS_SECRET_ACCESS_KEY=XXX  
export AWS_SESSION_TOKEN=XXX  
```

Navigate to the project folder where the ec2instancemonitor.tf.json is located.  
Use [TF manual](https://developer.hashicorp.com/terraform/tutorials/cli/plan) to support the next steps  
Run the followings commands :  
```
terraform init
terraform plan -out "tfplan"
terraform apply "tfplan"
```

Run the following command to remove all the resources created by the solution :  
```
terraform destroy
```

TF variables are defined at the end of the ec2instancemonitor.tf.json TF file.  
Default TF variable value can be used.


## SECURITY
This solution leverage dedicated IAM policy implementing a least privilege principle.
Note that some read only action like ec2: "ec2:DescribeInstances" and "ec2:DescribeTags" do not support resource-level permissions and force to use a wildcard "*" in the policy resource element (Confirmed with IAM policy simulator).
StepFunction use 2 LambdaFunction to implement the most complex logic.
These LambdaFunctions :
- Act as a pure function without any side effect or network access.
- Do not have any external dependencies ( Use the standard library provided by NodeJS only ).
- Are versioned and immutable ( StepFunction IAM role restrict invocation on specific version number ).
- Check input format and throw a "syntax error" to StepFunction if user input is not as expected ( such error do not trigger any retry ).

SNS topic at-rest encryption is enabled using a dedicated KMS key.  
The StepFunction sending the notification is the only authorized publisher.  

User parameters injected through EC2 tags must match specific REGEX to be used.  
In term of data protection, this solution processes EC2 metadata only :
- AWS account ID ( instance's owner account ).
- Availability Zone ID ( instance location ).
- Instance launch time.
- Instance type.
- Instance ID.

This solution creates a KMS key to enable at rest encryption wherever it's possible.  
You can use your own key by updating the key alias :  
1) Copy the key policy attached to the solution key and [merge it with your key policy](https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-modifying.html)  
2) [Update the key alias](https://docs.aws.amazon.com/kms/latest/developerguide/alias-manage.html) target to point to your key : ```$ aws kms update-alias --alias-name <SOLUTION_KEY_ALIAS> --target-key-id <YOUR_KEY_ID>```  
3) [Delete the solution key](https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html)  

This solution leverage 2 AWS Lambda functions.
Lambda versioning is enabled.
Function version are immutable and the solution enforce the use of a specific version when creating function instance from AWS Step Function.
WARNING : Code signing and signature validation are not enabled. 
You can follow [the AWS manual](https://docs.aws.amazon.com/lambda/latest/dg/configuration-codesigning.html) to implement this feature if it's required in your context. 


## NOTIFICATION
User can choose the notification method by editing the SNS topic.  
Email delivery has been tested during the implementation.  
This solution keep notifying user every hour with the updated instance runtime once the per instance threshold is reached.  
Subscription must be managed manually by editing the SNS topic.  
Notification routing is managed using SNS Subscription policy filter.  
Each message published to the SNS topic by the StepFunction has a specific "Target" message attribute that can be used for filtering.  
Then it's possible to define distribution group.  
The default distribution group used for all instance is defined in the TF configuration using the "MonitorGroup" parameter ( default value is "all" ).  
When creating an EC2 instance, it's possible to overwrite this default value using the "MonitorGroup" tag.  
The "MonitorGroup" define an instance group and the SNS Subscription policy filter allow to define a specific group list for each user.  
SNS Subscription policy filter example working with the "MonitorGroup" default value : 
```json
{
  "Target": [
    "all"
  ]
}
```

Here is the process for group subscription :
- Open the AWS WEB console  
- Go to the service selection panel and choose Simple Notification Service (SNS)  
- In the SNS console, make sure you are looking at the right AWS region (Region selector at the top right)  
- Click on "Topics" in the left menu  
- Click on the Topic created by this solution (Topic name = TF ProjectName variable)  
- Click on the "Create subscription" button at the bottom right  
- Choose the "Email" protocol  
- Fill the "Endpoint" field with an email address  
- Expand the subscription filter policy menu and enable this feature  
- Keep the policy scope on "Message attributes"  
- Copy paste the above filter policy or use one including a specific list of "MonitorGroup" (See above). This list is a JSON table attached to the "Target" JSON key  
- Click on "Create subscription"  
- Wait for the email to confirm this subscription  

ONE EC2 instance can be attached to ONE "MonitorGroup".  
ONE email address can subscribed to MANY "MonitorGroup".  

Solution to stop the notification :
- Delete the EventBridge scheduler corresponding to the instance manually. This scenario is handled by the solution.
- Unsubscribe from the SNS topic.  
- Stop and start the instance to reset the runtime.  
- Terminate the instance to delete automatically the corresponding EventBridge scheduler.  


## TAGS
EC2 tags MUST be inserted at EC2 instance launch time.  
Tags editing after launch time has no effect.  
Value defined at launch time are hardcoded in the scheduler doing the monitoring. 
The tag keys defining the solution behavior are :
- Monitor :  
  - Boolean
  - Enable the instance runtime monitoring for the instance ( False by default in the TF config ). Notifications are sent only if this value is "true".  

- MonitorGroup :  
  - String ^[a-z0-9]+$
  - Define the "Target" attribute for the notification message.  

- Threshold :  
  - Integer  
  - The threshold in hour after which the solution starts sending notifications every hour.  





