/**
 * Submission Quality Checker - Background Service Worker
 * Manages candidate profiles, submission audit logs, duplicate checks, and live webhook dispatching.
 */

// Default Initial Profiles (Synced from profiles.json)
const DEFAULT_PROFILES = [
  {
    "address": "3780 Northwest 22nd Ave",
    "archived": true,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "University of Notre Dame"
    },
    "city": "Miami",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 130000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "qweQWE123!@#",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 130000,
    "dob": "08/18/1998",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "adam.r.myers02@gmail.com"
    ],
    "firstName": "Nicholas",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Nicholas Adam Myers",
    "github": "",
    "graduationDate": "5/18/2011",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1790683197426",
    "languagesFrameworks": {
      "comfortableLanguages": "C#, .NET 8, .NET Core, .NET Framework, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, ASP.NET Web Forms, Entity Framework Core, Entity Framework, Dapper, LINQ, WCF, Dependency Injection, RESTful APIs, GraphQL, Microservices, Distributed Systems, Clean Architecture, Domain-Driven Design (DDD), CQRS, Event-Driven Architecture, SOLID Principles, Azure OpenAI, OpenAI API, Retrieval-Augmented Generation (RAG), Prompt Engineering, xUnit, NUnit, MSTest, Moq, Testcontainers, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration, React, TypeScript, JavaScript, Angular, Blazor, Razor Components, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "C#, .NET 8, .NET Core, .NET Framework, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, ASP.NET Web Forms, Entity Framework Core, Entity Framework, Dapper, LINQ, WCF, Dependency Injection, RESTful APIs, GraphQL, Microservices, Distributed Systems, Clean Architecture, Domain-Driven Design (DDD), CQRS, Event-Driven Architecture, SOLID Principles, Azure OpenAI, OpenAI API, Retrieval-Augmented Generation (RAG), Prompt Engineering, xUnit, NUnit, MSTest, Moq, Testcontainers, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration",
      "preferredDatabase": "SQL Server, Azure SQL Database, T-SQL, Amazon RDS, Redis, Apache Kafka, Azure Service Bus, Amazon SNS / SQS, Microsoft Azure, AWS, Azure Kubernetes Service (AKS), Amazon EKS, Azure API Management, Azure Functions, AWS Lambda, Docker, Kubernetes, Terraform, Azure DevOps, GitHub Actions, CI/CD, Containerization, Container Orchestration, Infrastructure as Code (IaC), Continuous Integration & Automated Deployment, Cloud Architecture, Relational Databases, Database Design & Optimization, Event-Driven Architecture, In-Memory Caching",
      "preferredFrontend": "React, TypeScript, JavaScript, Angular, Blazor, Razor Components, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "c#",
        ".net 8",
        ".net core",
        ".net framework",
        ".net",
        "asp.net core",
        "asp.net web api",
        "asp.net mvc",
        "asp.net web forms",
        "entity framework core",
        "entity framework",
        "dapper",
        "linq",
        "wcf",
        "dependency injection",
        "restful apis",
        "graphql",
        "microservices",
        "distributed systems",
        "clean architecture",
        "domain driven design  ddd",
        "cqrs",
        "event driven architecture",
        "solid principles",
        "azure openai",
        "openai api",
        "retrieval augmented generation  rag",
        "prompt engineering",
        "xunit",
        "nunit",
        "mstest",
        "moq",
        "testcontainers",
        "asynchronous messaging",
        "unit testing   mocking  tdd",
        "generative ai   llm integration",
        "react",
        "typescript",
        "javascript",
        "angular",
        "blazor",
        "razor components",
        "html5   css3",
        "responsive web design",
        "sql server",
        "azure sql database",
        "t sql",
        "amazon rds",
        "redis",
        "apache kafka",
        "azure service bus",
        "amazon sns   sqs",
        "microsoft azure",
        "aws",
        "azure kubernetes service  aks",
        "amazon eks",
        "azure api management",
        "azure functions",
        "aws lambda",
        "docker",
        "kubernetes",
        "terraform",
        "azure devops",
        "github actions",
        "ci cd",
        "containerization",
        "container orchestration",
        "infrastructure as code  iac",
        "continuous integration   automated deployment",
        "cloud architecture",
        "relational databases",
        "database design   optimization",
        "in memory caching",
        "domain driven design",
        "event driven",
        "architecture",
        "openapi",
        "azure",
        "functions",
        "amazon",
        "sns",
        "amazon sqs",
        "infrastructure as code",
        "automated deployment",
        "microsoft entra id",
        "oauth 2.0",
        "openid connect",
        "jwt",
        "rbac",
        "azure key vault",
        "aws secrets manager",
        "pci dss",
        "nlog",
        "azure application insights",
        "prometheus",
        "grafana",
        "distributed tracing"
      ]
    },
    "lastName": "Myers",
    "linkedin": "linkedin.com/in/adam-myers-6ab405428",
    "location": {
      "country": "United States",
      "resideState": "Florida",
      "willingToRelocate": "No"
    },
    "phone": "16452417687",
    "preferredName": "Adam Myers",
    "primaryEmail": "adam.r.myers02@gmail.com",
    "primaryStackKeywords": [
      "c#",
      ".net 8",
      ".net core",
      ".net framework",
      ".net",
      "asp.net core",
      "asp.net web api",
      "asp.net mvc",
      "asp.net web forms",
      "entity framework core",
      "entity framework",
      "dapper",
      "linq",
      "wcf",
      "dependency injection",
      "restful apis",
      "graphql",
      "microservices",
      "distributed systems",
      "clean architecture",
      "domain driven design  ddd",
      "cqrs",
      "event driven architecture",
      "solid principles",
      "azure openai",
      "openai api",
      "retrieval augmented generation  rag",
      "prompt engineering",
      "xunit",
      "nunit",
      "mstest",
      "moq",
      "testcontainers",
      "asynchronous messaging",
      "unit testing   mocking  tdd",
      "generative ai   llm integration",
      "react",
      "typescript",
      "javascript",
      "angular",
      "blazor",
      "razor components",
      "html5   css3",
      "responsive web design",
      "sql server",
      "azure sql database",
      "t sql",
      "amazon rds",
      "redis",
      "apache kafka",
      "azure service bus",
      "amazon sns   sqs",
      "microsoft azure",
      "aws",
      "azure kubernetes service  aks",
      "amazon eks",
      "azure api management",
      "azure functions",
      "aws lambda",
      "docker",
      "kubernetes",
      "terraform",
      "azure devops",
      "github actions",
      "ci cd",
      "containerization",
      "container orchestration",
      "infrastructure as code  iac",
      "continuous integration   automated deployment",
      "cloud architecture",
      "relational databases",
      "database design   optimization",
      "in memory caching",
      "domain driven design",
      "event driven",
      "architecture",
      "openapi",
      "azure",
      "functions",
      "amazon",
      "sns",
      "amazon sqs",
      "infrastructure as code",
      "automated deployment",
      "microsoft entra id",
      "oauth 2.0",
      "openid connect",
      "jwt",
      "rbac",
      "azure key vault",
      "aws secrets manager",
      "pci dss",
      "nlog",
      "azure application insights",
      "prometheus",
      "grafana",
      "distributed tracing"
    ],
    "requiresSponsorship": "No",
    "resumeText": "ADAM MYERS\nSenior Software Engineer | .NET Backend Engineering | Distributed Systems | Azure & AWS\n+1 (645) 241-7687 | Miami, FL | adam.r.myers02@gmail.com | linkedin.com/in/adam-myers-6ab405428\nPROFESSIONAL SUMMARY\nSenior Software Engineer with 12+ years of experience building and modernizing enterprise applications using C# , .NET ,\nASP.NET Core , and distributed systems across fintech, education, and healthcare domains. Experienced in developing scalable\nmicroservices , APIs , and cloud-native solutions with Azure , AWS , and DevOps practices , while applying Azure OpenAI ,\nRetrieval-Augmented Generation (RAG) , and prompt engineering to enhance application capabilities and business workflows.\nTECHNICAL SKILLS\nBackend Development: C#, .NET 8, .NET Core, .NET Framework, ASP.NET Core, ASP.NET Web API, ASP.NET MVC,\nASP.NET Web Forms, WCF, Entity Framework Core, Entity Framework, Dapper, LINQ, Dependency Injection\nArchitecture & Design: Microservices, Distributed Systems, Clean Architecture, Domain-Driven Design, CQRS, Event-Driven\nArchitecture, SOLID Principles, RESTful APIs, GraphQL, OpenAPI\nCloud & Infrastructure: Microsoft Azure, AWS, Azure Kubernetes Service (AKS), Amazon EKS, Azure API Management, Azure\nFunctions, AWS Lambda, Docker, Kubernetes, Terraform\nDatabases & Messaging: SQL Server, Azure SQL Database, Amazon RDS, Redis, Azure Service Bus, Apache Kafka, Amazon\nSNS, Amazon SQS, T-SQL\nDevOps & Delivery: Azure DevOps, GitHub Actions, CI/CD, Infrastructure as Code, Automated Deployment\nFrontend Development: Angular, Blazor, Razor Components, React, TypeScript, JavaScript, GraphQL\nSecurity: Microsoft Entra ID, OAuth 2.0, OpenID Connect, JWT, RBAC, Azure Key Vault, AWS Secrets Manager, PCI DSS\nTesting & Observability: xUnit, NUnit, MSTest, Moq, Testcontainers, NLog, Azure Application Insights, Prometheus, Grafana,\nDistributed Tracing\nApplied AI: Azure OpenAI, Retrieval-Augmented Generation (RAG), Prompt Engineering\nPROFESSIONAL EXPERIENCE\nParker | New York City, NY 03/2023 - 05/2026\nSenior Software Engineer\nLed the modernization of an enterprise payment platform using C# and .NET technologies to support merchant onboarding,\npayment authorization, settlement, reconciliation, and KYB verification workflows for secure financial operations.\n• Developed scalable backend services using C# , .NET 8 , and ASP.NET Core to support merchant onboarding, transaction\nprocessing, payment lifecycle management, and financial operations.\n• Designed and implemented microservices architecture using Clean Architecture , Domain-Driven Design , CQRS , and\nevent-driven patterns to improve scalability, maintainability, and consistency across payment services.\n• Built enterprise-grade RESTful APIs and GraphQL services with ASP.NET Core , Entity Framework Core , and Dapper ,\nreducing response times by 34% across transaction and merchant-management workflows.\n• Developed distributed .NET microservices using Azure Service Bus , Apache Kafka , and Azure Functions to process\npayment events and automate downstream financial workflows.\n• Containerized and deployed ASP.NET Core applications on Azure Kubernetes Service (AKS) while managing API traffic\nthrough Azure API Management , improving scalability and operational reliability.\n• Optimized backend performance through Azure SQL Database tuning, query optimization, and refined Entity Framework Core\ndata-access patterns across authorization, settlement, and reconciliation services.\n• Automated application delivery and infrastructure workflows using Terraform and Azure DevOps CI/CD , reducing deployment\ntime by 28% .\n• Strengthened application security using Microsoft Entra ID , OAuth 2.0 , OpenID Connect , and RBAC to support secure\nfinancial data exchange and PCI DSS compliance .\n• Developed internal operations applications using Blazor , Razor Components , Angular , and TypeScript to support compliance\nteams managing KYB reviews and merchant workflows.\n• Implemented monitoring and distributed tracing using Azure Application Insights , Prometheus , and Grafana to improve\nproduction visibility, troubleshooting, and system reliability.\n• Integrated Azure OpenAI , Retrieval-Augmented Generation (RAG) , and prompt engineering into fraud-investigation\nworkflows, enabling analysts to retrieve transaction context and improve suspicious activity analysis.\n\n• Improved engineering quality through xUnit , Moq , and Testcontainers while leading code reviews, participating in architecture\ndiscussions, collaborating with product and compliance teams, and mentoring engineers on scalable backend development\npractices.\nMcGraw Hill | Columbus, OH 11/2014 - 02/2023\nSoftware Developer\nDeveloped and modernized enterprise education technology platforms supporting student enrollment, digital content delivery,\nassessments, automated grading, instructor workflows, and learning analytics.\n• Developed scalable backend applications using C# , .NET Framework , ASP.NET MVC , ASP.NET Web API , and SQL Server to\nsupport student management, course delivery, assessment processing, and digital learning workflows.\n• Designed and maintained enterprise integrations using WCF services , REST APIs , Entity Framework , and LINQ , enabling\ncommunication between identity, enrollment, publishing, assessment, and reporting systems.\n• Improved legacy application maintainability by applying SOLID principles , object-oriented design patterns, and Dependency\nInjection while refactoring core business modules and improving code quality.\n• Modernized backend services by migrating selected application components to ASP.NET Core , Entity Framework Core , and\nAPI-driven architectures to support evolving student and instructor requirements.\n• Contributed to the evolution toward distributed application design by introducing microservices-based components , improving\ndeployment flexibility and simplifying future platform enhancements.\n• Built asynchronous processing workflows using AWS Lambda , Amazon SNS , and Amazon SQS to handle enrollment updates,\nassessment submissions, grading notifications, and learning activity events.\n• Supported cloud adoption initiatives by containerizing applications with Docker , deploying workloads on Amazon EKS , and\nimproving delivery workflows through GitHub Actions CI/CD .\n• Optimized application data performance by improving SQL Server queries through T-SQL and Query Optimization techniques\nwhile integrating Amazon RDS and Redis Caching to support scalable and responsive application workflows.\n• Strengthened application security by implementing ASP.NET Identity , JWT authentication , and role-based authorization\nacross student, instructor, and administrative applications.\n• Improved application stability by maintaining legacy MSTest coverage and NLog logging practices while gradually adopting\nmodern unit testing approaches with NUnit and Moq to improve code quality and maintainability.\n• Developed modern user experiences using React , TypeScript , and GraphQL , supporting instructor dashboards, assignment\nmanagement, course materials, and student learning interactions.\n• Collaborated with product managers, QA engineers, and engineering teams to analyze requirements, review technical solutions,\ntroubleshoot production issues, and continuously improve platform capabilities.\nCerner | North Kansas City, MO 12/2013 - 08/2014\nSoftware Engineer\nDeveloped and maintained enterprise healthcare applications supporting electronic health records (EHR), patient management\nworkflows, clinical operations, and healthcare reporting.\n• Developed healthcare application features using C# , .NET Framework , ASP.NET Web Forms , and SQL Server to support\nclinical workflows, patient information management, and internal healthcare operations.\n• Built and maintained data access components using ADO.NET , T-SQL , and stored procedures , improving reliability and\nperformance of healthcare data processing workflows.\n• Enhanced enterprise application integrations through WCF services and XML-based communication patterns, enabling data\nexchange between internal healthcare systems.\n• Supported application enhancements, troubleshooting, and production fixes while collaborating with QA analysts and healthcare\nstakeholders to deliver reliable software solutions.\nEDUCATION\nBachelor of Science in Computer Science, University of Notre Dame 2007 - 2011",
    "salaryFloor": 120000,
    "school": "University of Notre Dame",
    "state": "Florida",
    "tailoringMode": "base",
    "targetStack": "Full Stack C# / .NET / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "12+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "33142"
  },
  {
    "address": "15374 SW 141st Ter",
    "archived": true,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "PA"
    },
    "city": "Miami",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 130000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "qweQWE123!@#",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 130000,
    "dob": "",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "andrerobbrown0707@gmail.com"
    ],
    "firstName": "Andre",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Andre Robert Brown",
    "github": "",
    "graduationDate": "May 1, 2012",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1790703319880",
    "languagesFrameworks": {
      "comfortableLanguages": "C#, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, Entity Framework Core, Entity Framework, Python, Node.js, Java, Spring Boot, RESTful APIs, Microservices, Azure OpenAI, OpenAI API, xUnit, Testcontainers, Distributed Systems, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration, React, Next.js, TypeScript, Angular, RxJS, JavaScript, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "C#, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, Entity Framework Core, Entity Framework, Python, Node.js, Java, Spring Boot, RESTful APIs, Microservices, Azure OpenAI, OpenAI API, xUnit, Testcontainers, Distributed Systems, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration",
      "preferredDatabase": "SQL Server, Azure SQL Database, PostgreSQL, Redis, Azure Service Bus, Amazon SNS / SQS, Microsoft Azure, AWS, Azure Kubernetes Service (AKS), Amazon EKS, Azure Functions, Amazon S3, Docker, Terraform, Azure DevOps, GitHub Actions, Containerization, Container Orchestration, Infrastructure as Code (IaC), CI/CD, Continuous Integration & Automated Deployment, Cloud Architecture, Relational Databases, Database Design & Optimization, T-SQL, Event-Driven Architecture, In-Memory Caching",
      "preferredFrontend": "React, Next.js, TypeScript, Angular, RxJS, JavaScript, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "c#",
        ".net",
        "asp.net core",
        "asp.net web api",
        "asp.net mvc",
        "entity framework core",
        "entity framework",
        "python",
        "node.js",
        "java",
        "spring boot",
        "restful apis",
        "microservices",
        "azure openai",
        "openai api",
        "xunit",
        "testcontainers",
        "distributed systems",
        "asynchronous messaging",
        "unit testing   mocking  tdd",
        "generative ai   llm integration",
        "react",
        "next.js",
        "typescript",
        "angular",
        "rxjs",
        "javascript",
        "html5   css3",
        "responsive web design",
        "sql server",
        "azure sql database",
        "postgresql",
        "redis",
        "azure service bus",
        "amazon sns   sqs",
        "microsoft azure",
        "aws",
        "azure kubernetes service  aks",
        "amazon eks",
        "azure functions",
        "amazon s3",
        "docker",
        "terraform",
        "azure devops",
        "github actions",
        "containerization",
        "container orchestration",
        "infrastructure as code  iac",
        "ci cd",
        "continuous integration   automated deployment",
        "cloud architecture",
        "relational databases",
        "database design   optimization",
        "t sql",
        "event driven architecture",
        "in memory caching"
      ]
    },
    "lastName": "Brown",
    "linkedin": "linkedin.com/in/andrbwn",
    "location": {
      "country": "United States",
      "resideState": "Florida",
      "willingToRelocate": "No"
    },
    "phone": "7869274881",
    "preferredName": "Andre Robert Brown",
    "primaryEmail": "andrerobbrown0707@gmail.com",
    "primaryStackKeywords": [
      "c#",
      ".net",
      "asp.net core",
      "asp.net web api",
      "asp.net mvc",
      "entity framework core",
      "entity framework",
      "python",
      "node.js",
      "java",
      "spring boot",
      "restful apis",
      "microservices",
      "azure openai",
      "openai api",
      "xunit",
      "testcontainers",
      "distributed systems",
      "asynchronous messaging",
      "unit testing   mocking  tdd",
      "generative ai   llm integration",
      "react",
      "next.js",
      "typescript",
      "angular",
      "rxjs",
      "javascript",
      "html5   css3",
      "responsive web design",
      "sql server",
      "azure sql database",
      "postgresql",
      "redis",
      "azure service bus",
      "amazon sns   sqs",
      "microsoft azure",
      "aws",
      "azure kubernetes service  aks",
      "amazon eks",
      "azure functions",
      "amazon s3",
      "docker",
      "terraform",
      "azure devops",
      "github actions",
      "containerization",
      "container orchestration",
      "infrastructure as code  iac",
      "ci cd",
      "continuous integration   automated deployment",
      "cloud architecture",
      "relational databases",
      "database design   optimization",
      "t sql",
      "event driven architecture",
      "in memory caching"
    ],
    "requiresSponsorship": "No",
    "resumeText": "Andre Robert Brown\nMiami, FL • andrerobbrown0707@gmail.com • (786) 927-4881 • linkedin.com/in/andrbwn/\nSUMMARY\nSenior full-stack software engineer with 8+ years building and modernizing enterprise software across insurance,\nprofessional services, and transportation. Brings hands-on depth in C#/.NET , ASP.NET Core , REST APIs , microservices ,\nReact , Angular , TypeScript, SQL Server, PostgreSQL, and experienced advanced-level of Java , Node.js and Python . 7+\nyears of experience with cloud-native Microservices with Azure and AWS and Big-Data technologies like ETL, SSIS, SSRS\nand Azure Data Factory.\nPROFESSIONAL EXPERIENCE\nACCENTURE LLP Chicago, IL (Remote)\nSenior Software Engineer | .NET/React Engineering | Azure Architecture March 2025 - May 2026\nLed Project Beacon, a policy and claims servicing modernization for a national insurer, replacing fragmented\nservicerepresentative and adjuster workflows with a shared servicing platform.\n• Designed Beacon's core around ASP.NET Core, and React on Azure , with supporting Java/Spring Boot adapters for\nlegacy policy-administration, document, and carrier integrations.\n• Separated synchronous policy commands from claims and case events using Azure Service Bus , transactional\noutbox, and idempotent consumers, preventing duplicate updates when servicing traffic spiked.\n• Reworked Entity Framework Core and Azure SQL queries behind customer search, policy history, and claim-detail\nendpoints, using targeted indexes and Redis to lower p95 latency from 780 to 430 milliseconds.\n• Built Azure Data Factory ETL pipelines with ADLS Gen2 and Azure SQL staging to extract and reconcile customer,\npolicy, claim, and reference data from legacy systems during migration.\n• Built React and TypeScript work queues combining policy history, claim status, required documents, and next\nactions, reducing application switching for service representatives and adjusters.\n• Implemented OAuth and OpenID Connect with Microsoft Entra ID , enforcing role-based access to servicing and\napproval actions with Key Vault-managed secrets and immutable audit records.\n• Containerized services with Docker and AKS , codified Azure environments in Terraform, and standardized Azure\nDevOps pipelines so teams could promote and roll back releases consistently.\n• Expanded xUnit, Testcontainers , contract , and Playwright coverage around policy and claim workflows, raising\nautomated coverage from 62% to 84% before production cutover.\n• Instrumented APIs, database calls, and queues with OpenTelemetry and Application Insights , adding dependency\ndashboards and runbooks that improved mean time to recovery by 31%.\n• Mentored six engineers through architecture reviews, code reviews, and pairing while coordinating release\ndecisions with product, quality, security, and client operations.\n• Expanded Project Beacon with Azure OpenAI and Azure AI Search to draft case summaries from servicing notes\nand documents, with PII redaction, evaluation sets, and mandatory human approval before use.\nKPMG INTERNATIONAL New York, NY (Remote)\nSenior Software Engineer | .NET/Angular Engineering | AWS Modernization January 2021 - February 2025\nOwned ClearanceOne, KPMG's engagement acceptance and independence platform, capturing proposed engagements,\nsurfacing client conflicts, routing risk approvals, and retaining review evidence before work began.\n• Modernized ClearanceOne from . NET Framework MVC to ASP.NET Core and Angular on AWS , allowing high-change\nintake, conflict, and approval workflows to be released independently.\n\n• Modeled domain boundaries for prospective clients, engagements, conflicts, approvals, and evidence, exposing\nEntity Framework Core -backed REST APIs to internal applications and enterprise consumers.\n• Moved scheduled conflict checks, reminders, and downstream updates to Amazon SQS event workflows with\nretries and dead-letter handling, reducing failed overnight processing by 40%.\n• Deployed core C#/.NET services and supporting Java/Spring Boot integration services to Amazon EKS with Helm\nand Terraform, using PostgreSQL and Secrets Manager for resilient environment-specific configuration.\n• Built AWS Glue and Amazon S3 ETL pipelines to ingest, validate, and reconcile client, engagement, approval, and\nexception data for compliance reporting, loading curated datasets into PostgreSQL and cutting the largest report\nfrom 47 minutes to 18 minutes.\n• Developed Angular and TypeScript modules for engagement intake, independence questions, conflict resolution,\nand approval routing, using RxJS state management and reusable validation controls.\n• Enforced federated sign-on, attribute-based permissions, encryption, and immutable audit events so sensitive\nengagement data and approval changes remained traceable to authorized users.\n• Built GitHub Actions quality gates with xUnit , contract tests, Cypress , and security scanning, lowering escaped\ndefects across quarterly releases by 27%.\n• Established CloudWatch and OpenTelemetry dashboards for queue backlog, integration failures, and slow\napproval/reporting paths, with incident playbooks for production support.\n• Mentored four engineers and facilitated architecture decisions with product, security, and data teams, balancing\ndelivery commitments with modernization risk.\nFLEET ADVANTAGE Fort Lauderdale, FL (Hybrid)\nSoftware Engineer | Data Integration | C#/.NET and SQL Engineering April 1, 2018 - December 1, 2020\nBuilt FleetPulse, a fleet lifecycle application bringing asset, mileage, maintenance, and lease data into one view for\noperations and finance teams evaluating truck health and replacement timing.\n• Developed FleetPulse modules with C#, ASP.NET MVC, Web API, and SQL Server for asset status, maintenance\nexceptions, lease economics, and replacement-planning workflows.\n• Created REST integrations in C#/.NET and maintained a supporting Java/Spring Boot service for telematics and\nvendor feeds, validating and normalizing incoming records before lifecycle and cost calculations.\n• Built and tuned SSIS ETL pipelines , staging tables, stored procedures, and indexes behind nightly fleet-health and\ncost calculations, reducing processing from 2.6 hours to 58 minutes so next-day planning data was available earlier.\n• Moved high-volume provider imports to Azure Functions and Service Bus with retry-safe handlers, isolating vendor\nfailures so one delayed or malformed feed did not block the nightly load.\n• Extended FleetPulse with lease-cost and residual-value rules to compare keep-versus-replace scenarios, giving\nfinance teams consistent assumptions for renewals, replacements, and remarketing decisions.\n• Added unit and integration tests , pull-request checks, deployment scripts, and production diagnostics around core\nasset and replacement workflows, reducing recurring defects by 25%.\nEDUCATION\nMILLERSVILLE UNIVERSITY PA\nBachelor of Science in Computer Science May 2012",
    "salaryFloor": 120000,
    "school": "PA",
    "state": "Florida",
    "tailoringMode": "base",
    "targetStack": "Full Stack C# / .NET / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "7+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "33196"
  },
  {
    "address": "11607 Curate Wind Ct",
    "archived": false,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "Baylor University"
    },
    "city": "Richmond",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 130000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "qweQWE123!@#",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 130000,
    "dob": "11/03/1993",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "mathbrbts@gmail.com"
    ],
    "firstName": "Matthew",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Matthew Roberts",
    "github": "",
    "graduationDate": "May 1, 2016",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1790703617775",
    "languagesFrameworks": {
      "comfortableLanguages": "Python, FastAPI, Node.js, RESTful APIs, AI-Assisted Development, pytest, Unit Testing & Mocking (TDD), Generative AI & LLM Integration, React, TypeScript, JavaScript, Responsive Design, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "Python, FastAPI, Node.js, RESTful APIs, AI-Assisted Development, pytest, Unit Testing & Mocking (TDD), Generative AI & LLM Integration",
      "preferredDatabase": "PostgreSQL, AWS, Docker, Terraform, GitHub Actions, CI/CD, Git, Containerization, Infrastructure as Code (IaC), Continuous Integration & Automated Deployment, Relational Databases, Database Design & Optimization",
      "preferredFrontend": "React, TypeScript, JavaScript, Responsive Design, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "python",
        "fastapi",
        "node.js",
        "restful apis",
        "ai assisted development",
        "pytest",
        "unit testing   mocking  tdd",
        "generative ai   llm integration",
        "react",
        "typescript",
        "javascript",
        "responsive design",
        "html5   css3",
        "responsive web design",
        "postgresql",
        "aws",
        "docker",
        "terraform",
        "github actions",
        "ci cd",
        "git",
        "containerization",
        "infrastructure as code  iac",
        "continuous integration   automated deployment",
        "relational databases",
        "database design   optimization",
        "domain modeling",
        "service oriented architecture",
        "sql",
        "relational modeling",
        "schema design",
        "query optimization",
        "rest apis",
        "webhooks",
        "oauth 2.0",
        "idempotent processing",
        "integration testing",
        "contract testing",
        "opentelemetry",
        "structured",
        "logging",
        "github copilot",
        "agentic coding workflows",
        "production troubleshooting"
      ]
    },
    "lastName": "Roberts",
    "linkedin": "linkedin.com/in/matt-roberts-25998588",
    "location": {
      "country": "United States",
      "resideState": "Texas",
      "willingToRelocate": "No"
    },
    "phone": "7139780329",
    "preferredName": "Matthew Roberts",
    "primaryEmail": "mathbrbts@gmail.com",
    "primaryStackKeywords": [
      "python",
      "fastapi",
      "node.js",
      "restful apis",
      "ai assisted development",
      "pytest",
      "unit testing   mocking  tdd",
      "generative ai   llm integration",
      "react",
      "typescript",
      "javascript",
      "responsive design",
      "html5   css3",
      "responsive web design",
      "postgresql",
      "aws",
      "docker",
      "terraform",
      "github actions",
      "ci cd",
      "git",
      "containerization",
      "infrastructure as code  iac",
      "continuous integration   automated deployment",
      "relational databases",
      "database design   optimization",
      "domain modeling",
      "service oriented architecture",
      "sql",
      "relational modeling",
      "schema design",
      "query optimization",
      "rest apis",
      "webhooks",
      "oauth 2.0",
      "idempotent processing",
      "integration testing",
      "contract testing",
      "opentelemetry",
      "structured",
      "logging",
      "github copilot",
      "agentic coding workflows",
      "production troubleshooting"
    ],
    "requiresSponsorship": "No",
    "resumeText": "MATTHEW ROBERTS\nSenior Software Engineer | Full-Stack Python & TypeScript | AI-Assisted Product Engineering\nmathbrbts@gmail.com | (713) 978 0329 | Richmond, TX | linkedin.com/in/matt-roberts-25998588/\nPROFESSIONAL SUMMARY\nSenior software engineer with nearly 10 years of experience building production web applications and client-facing platforms across\nmarketplace and consulting environments, progressing into architecture and technical ownership. Combines Python , FastAPI ,\nTypeScript , React , PostgreSQL , and AWS to turn ambiguous workflows into maintainable services, integrations, interfaces, and\nproduction-ready prototypes. Brings pragmatic judgment to AI-assisted development , automated testing, cloud delivery, technical\ndiscovery, production diagnosis, code review , and mentoring while connecting engineering choices to real user and operational needs.\nTECHNICAL SKILLS\nBackend & Architecture: Python, FastAPI, TypeScript, Node.js, Domain Modeling, Service-Oriented Architecture\nFrontend Development: React, JavaScript, Responsive Design\nDatabases & Data Access: PostgreSQL, SQL, Relational Modeling, Schema Design, Query Optimization\nAPIs & Integrations: REST APIs, Webhooks, OAuth 2.0, Idempotent Processing\nCloud & Delivery: AWS, Docker, Terraform, Git, GitHub Actions, CI/CD\nTesting, Observability & AI-Assisted Engineering: pytest, Integration Testing, Contract Testing, OpenTelemetry, Structured\nLogging, GitHub Copilot, Agentic Coding Workflows, Production Troubleshooting\nEXPERIENCE\nSenior Software Engineer - Full-Stack Python Systems | AI-Assisted Product Engineering 10/2024 - 06/2026\nEtsy, Inc. | Remote\nTook ownership of Seller Support Studio, a FastAPI application helping operations teams resolve marketplace exceptions after\nfragmented tools obscured case state and recovery options.\nMapped investigator workflows with product partners, then separated Python domain rules from presentation logic so new case types\nreused tested decisions instead of view-specific conditionals.\nBuilt a TypeScript and Node.js integration layer for partner webhooks , normalizing authentication and retry behavior so provider\nfailures remained isolated from core workflows.\nModeled case history in PostgreSQL with transactional updates and idempotency controls, preventing repeated requests from creating\nconflicting seller resolutions during retries.\nRebuilt investigator controls with React and TypeScript , reducing median case-resolution time by 30% after usability reviews\nexposed repeated navigation and missing decision context.\nTuned PostgreSQL query plans around case timelines, lowering p95 response time from 1.8 seconds to 680 milliseconds under\nrepresentative production load.\nUsed GitHub Copilot within reviewed agentic coding workflows to draft regression scenarios, while pytest gates ensured generated\nchanges preserved authorization and recovery behavior.\nStandardized Dockerized AWS releases with GitHub Actions and OpenTelemetry traces, giving on-call engineers reproducible\ndeployments and clearer evidence when production regressions appeared.\nSenior Architect - Client Product Architecture | Full-Stack Delivery 07/2022 - 09/2024\nCredera\nProposed ForgeOps, a FastAPI operations platform after a logistics client outgrew spreadsheet-driven exception handling that\nobscured request ownership and downstream processing state.\nTranslated user interviews into service and schema boundaries, giving the delivery team a phased architecture that preserved daily\noperations while high-change workflows moved incrementally.\nBuilt authenticated REST APIs around stable operational resources, reducing integration-related production defects by 39% after\ninconsistent payload and error handling were consolidated.\nCreated reviewer workflows with React and TypeScript , giving dispatch users validation context beside actions so exceptions could\nbe resolved without switching among disconnected tools.\nDefined AWS infrastructure with Terraform , giving client teams reviewable environment changes while Docker images kept\napplication behavior consistent across development and production.\nPrototyped an AI-assisted exception triage workflow using approved operational data, cutting initial investigation time by 28% while\nkeeping final decisions with human reviewers.\nReviewed implementation plans and code with engineers, documenting API contracts and failure boundaries so later work preserved\nestablished reliability, security, and maintainability expectations.\nSenior Software Engineer, Architect - Python Integration Services | Production Reliability 01/2021 - 07/2022\nCredera\nInherited PartnerFlow, a Python integration service whose provider failures forced operations teams into manual recovery, then\nmapped persisted state before restructuring processing boundaries.\n\nSeparated partner transformations behind typed service interfaces, allowing provider-specific authentication and payload changes to\nevolve without destabilizing shared workflow rules.\nReworked transactional state in PostgreSQL with idempotency keys, reducing duplicate recovery actions by 55% after interrupted\nsubmissions previously re-entered processing inconsistently.\nAdded pytest contract tests around partner APIs, giving engineers safer refactors while preserving behavior required by existing client\nintegrations.\nInstrumented API and worker paths with OpenTelemetry correlation traces, helping support teams isolate cross-service failures\nwithout reconstructing transactions manually from database records.\nSenior Technical Consultant - Full-Stack Python Applications | Client Workflows 10/2018 - 01/2021\nCredera\nDiagnosed enrollment exceptions by tracing browser requests through Python services, uncovering duplicated eligibility rules that\nproduced conflicting decisions across administrative workflows.\nCentralized effective-date calculations in PostgreSQL , giving application screens and exports one authoritative result so specialists\nstopped correcting repeated policy mismatches.\nRebuilt exception workflows with React and JavaScript , reducing average resolution time by 34% after usability reviews exposed\nrepeated navigation and missing validation context.\nAdded integration tests and Git review checks around workflow changes, giving distributed consultants safer evidence for incremental\nmodernization of established production code.\nSoftware Engineer, Technology Consultant - Python Web Development | Application Integration 08/2016 - 10/2018\nCredera\nTraced order-entry defects through a Python web application, finding inconsistent validation that allowed incomplete requests to enter\ndownstream fulfillment workflows.\nReworked SQL constraints and transaction handling around order edits, reducing repeat inventory-correction tickets by 23% while\nkeeping reservations synchronized with customer-visible state.\nAdded supplier availability through REST APIs , mapping remote failures into retryable states so account teams could recover orders\nwithout direct database intervention.\nExpanded automated tests and Git deployment checks around high-risk order paths, giving senior engineers reproducible release\nevidence and clearer production-support procedures.\nEDUCATION\nBachelor of Science in Mathematics and Computer Science 2016\nBaylor University",
    "salaryFloor": 120000,
    "school": "Baylor University",
    "state": "Texas",
    "tailoringMode": "tailored",
    "targetStack": "Full Stack Python / AI / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "10+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "77407"
  },
  {
    "address": "8877 Lakes At 610, Apt 462",
    "archived": true,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Business Information Technology",
      "schoolsAttended": "Virginia Tech(Virginia Polytechnic Institute and State University)"
    },
    "city": "Houston",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 130000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "qweQWE123!@#",
    "degree": "Business Information Technology",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 130000,
    "dob": "09/07/1991",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "andybailey214@gmail.com"
    ],
    "firstName": "Andrew",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Andrew Bailey",
    "github": "",
    "graduationDate": "5/13/2014",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1790703871467",
    "languagesFrameworks": {
      "comfortableLanguages": "C#, .NET 8, .NET Core, .NET Framework, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, ASP.NET Web Forms, Entity Framework Core, Entity Framework, Dapper, WCF, Dependency Injection, RESTful APIs, GraphQL, Microservices, Distributed Systems, Domain-Driven Design (DDD), Event-Driven Architecture, Azure OpenAI, OpenAI API, Retrieval-Augmented Generation (RAG), Prompt Engineering, AI-Assisted Development, xUnit, NUnit, MSTest, Moq, Testcontainers, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration, React, Next.js, TypeScript, JavaScript, Angular, Blazor, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "C#, .NET 8, .NET Core, .NET Framework, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, ASP.NET Web Forms, Entity Framework Core, Entity Framework, Dapper, WCF, Dependency Injection, RESTful APIs, GraphQL, Microservices, Distributed Systems, Domain-Driven Design (DDD), Event-Driven Architecture, Azure OpenAI, OpenAI API, Retrieval-Augmented Generation (RAG), Prompt Engineering, AI-Assisted Development, xUnit, NUnit, MSTest, Moq, Testcontainers, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration",
      "preferredDatabase": "SQL Server, Azure SQL Database, PostgreSQL, T-SQL, Redis, DynamoDB, Apache Kafka, RabbitMQ, Azure Service Bus, Amazon SNS / SQS, Microsoft Azure, AWS, Azure Kubernetes Service (AKS), Azure API Management, Azure Functions, AWS Lambda, Docker, Kubernetes, Terraform, Azure DevOps, GitHub Actions, CI/CD, Containerization, Container Orchestration, Infrastructure as Code (IaC), Continuous Integration & Automated Deployment, Cloud Architecture, Relational Databases, Database Design & Optimization, Event-Driven Architecture, In-Memory Caching",
      "preferredFrontend": "React, Next.js, TypeScript, JavaScript, Angular, Blazor, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "c#",
        ".net 8",
        ".net core",
        ".net framework",
        ".net",
        "asp.net core",
        "asp.net web api",
        "asp.net mvc",
        "asp.net web forms",
        "entity framework core",
        "entity framework",
        "dapper",
        "wcf",
        "dependency injection",
        "restful apis",
        "graphql",
        "microservices",
        "distributed systems",
        "domain driven design  ddd",
        "event driven architecture",
        "azure openai",
        "openai api",
        "retrieval augmented generation  rag",
        "prompt engineering",
        "ai assisted development",
        "xunit",
        "nunit",
        "mstest",
        "moq",
        "testcontainers",
        "asynchronous messaging",
        "unit testing   mocking  tdd",
        "generative ai   llm integration",
        "react",
        "next.js",
        "typescript",
        "javascript",
        "angular",
        "blazor",
        "html5   css3",
        "responsive web design",
        "sql server",
        "azure sql database",
        "postgresql",
        "t sql",
        "redis",
        "dynamodb",
        "apache kafka",
        "rabbitmq",
        "azure service bus",
        "amazon sns   sqs",
        "microsoft azure",
        "aws",
        "azure kubernetes service  aks",
        "azure api management",
        "azure functions",
        "aws lambda",
        "docker",
        "kubernetes",
        "terraform",
        "azure devops",
        "github actions",
        "ci cd",
        "containerization",
        "container orchestration",
        "infrastructure as code  iac",
        "continuous integration   automated deployment",
        "cloud architecture",
        "relational databases",
        "database design   optimization",
        "in memory caching",
        "entity",
        "framework core",
        "domain driven design",
        "solid",
        "resilient systems",
        "aks",
        "azure sql",
        "cosmos",
        "db",
        "azure storage",
        "api gateway",
        "amazon sqs",
        "stored procedures",
        "indexing",
        "query optimization",
        "infrastructure as code",
        "microsoft entra id",
        "rbac",
        "azure key vault",
        "managed identity",
        "hipaa",
        "fhir",
        "hl7",
        "ehr integrations",
        "application insights",
        "azure log analytics",
        "grafana",
        "datadog",
        "opentelemetry",
        "llms",
        "rag",
        "azure ai search",
        "prompt versioning",
        "phi redaction"
      ]
    },
    "lastName": "Bailey",
    "linkedin": "linkedin.com/in/andrew-bailey-857a76428",
    "location": {
      "country": "United States",
      "resideState": "Texas",
      "willingToRelocate": "No"
    },
    "phone": "17373124735",
    "preferredName": "Andrew Bailey",
    "primaryEmail": "andybailey214@gmail.com",
    "primaryStackKeywords": [
      "c#",
      ".net 8",
      ".net core",
      ".net framework",
      ".net",
      "asp.net core",
      "asp.net web api",
      "asp.net mvc",
      "asp.net web forms",
      "entity framework core",
      "entity framework",
      "dapper",
      "wcf",
      "dependency injection",
      "restful apis",
      "graphql",
      "microservices",
      "distributed systems",
      "domain driven design  ddd",
      "event driven architecture",
      "azure openai",
      "openai api",
      "retrieval augmented generation  rag",
      "prompt engineering",
      "ai assisted development",
      "xunit",
      "nunit",
      "mstest",
      "moq",
      "testcontainers",
      "asynchronous messaging",
      "unit testing   mocking  tdd",
      "generative ai   llm integration",
      "react",
      "next.js",
      "typescript",
      "javascript",
      "angular",
      "blazor",
      "html5   css3",
      "responsive web design",
      "sql server",
      "azure sql database",
      "postgresql",
      "t sql",
      "redis",
      "dynamodb",
      "apache kafka",
      "rabbitmq",
      "azure service bus",
      "amazon sns   sqs",
      "microsoft azure",
      "aws",
      "azure kubernetes service  aks",
      "azure api management",
      "azure functions",
      "aws lambda",
      "docker",
      "kubernetes",
      "terraform",
      "azure devops",
      "github actions",
      "ci cd",
      "containerization",
      "container orchestration",
      "infrastructure as code  iac",
      "continuous integration   automated deployment",
      "cloud architecture",
      "relational databases",
      "database design   optimization",
      "in memory caching",
      "entity",
      "framework core",
      "domain driven design",
      "solid",
      "resilient systems",
      "aks",
      "azure sql",
      "cosmos",
      "db",
      "azure storage",
      "api gateway",
      "amazon sqs",
      "stored procedures",
      "indexing",
      "query optimization",
      "infrastructure as code",
      "microsoft entra id",
      "rbac",
      "azure key vault",
      "managed identity",
      "hipaa",
      "fhir",
      "hl7",
      "ehr integrations",
      "application insights",
      "azure log analytics",
      "grafana",
      "datadog",
      "opentelemetry",
      "llms",
      "rag",
      "azure ai search",
      "prompt versioning",
      "phi redaction"
    ],
    "requiresSponsorship": "No",
    "resumeText": "ANDREW BAILEY\nStaff Software Engineer | .NET Backend Engineering | Distributed Systems | Azure & AWS\nHouston, TX | +1 (737) 312-4735 | andybailey214@gmail.com | linkedin.com/in/andrew-bailey-857a76428/\nPROFESSIONAL SUMMARY\nStaff Software Engineer with 11+ years of experience designing, modernizing, and supporting enterprise software across\nhealthcare, manufacturing, cloud infrastructure, and insurance. Deep expertise in C# , .NET 8 , ASP.NET Core , microservices ,\ndistributed systems , API design , event-driven architecture , and cloud-native development across Microsoft Azure and\nAWS . Brings a progressive engineering background spanning legacy .NET Framework applications, multi-tenant .NET Core\nplatforms, distributed .NET 6/8 services, and staff-level architecture leadership . Combines hands-on backend\nengineering with technical strategy , production ownership, mentoring, and cross-functional collaboration to deliver secure,\nscalable, and maintainable platforms.\nTECHNICAL SKILLS\nBackend Development: C#, .NET 8, .NET Core, .NET Framework, ASP.NET Core, ASP.NET MVC, ASP.NET Web API, Entity\nFramework Core, Entity Framework, Dapper\nArchitecture & APIs: Microservices, Domain-Driven Design, Event-Driven Architecture, RESTful APIs, GraphQL, WCF, SOLID,\nDependency Injection, Resilient Systems\nCloud Platforms: Microsoft Azure, AWS, AKS, Azure Functions, Azure API Management, Azure Service Bus, Azure SQL, Cosmos\nDB, Azure Storage, AWS Lambda, API Gateway\nData & Messaging: SQL Server, PostgreSQL, T-SQL, Redis, Apache Kafka, RabbitMQ, Amazon SQS, Stored Procedures, Indexing,\nQuery Optimization\nDevOps & Infrastructure: Terraform, Docker, Kubernetes, Azure DevOps, GitHub Actions, CI/CD, Infrastructure as Code\nSecurity & Healthcare: Microsoft Entra ID, RBAC, Azure Key Vault, Managed Identity, HIPAA, FHIR, HL7, EHR Integrations\nTesting & Observability: xUnit, Moq, NUnit, MSTest, Testcontainers, Application Insights, Azure Log Analytics, Grafana, Datadog,\nOpenTelemetry\nFrontend Development: Angular, React, Blazor, TypeScript, JavaScript, ASP.NET MVC\nApplied AI: Azure OpenAI, LLMs, RAG, Azure AI Search, Prompt Engineering, Prompt Versioning, PHI Redaction\nPROFESSIONAL EXPERIENCE\nCARBON HEALTH | San Francisco, CA 12/2024 - 06/2026\nStaff Software Engineer\nDirected .NET 8 , ASP.NET Core , and applied-AI platform architecture for healthcare systems supporting patient access,\nappointment scheduling, clinical operations, provider workflows, protected health information, AI-assisted knowledge retrieval , and\nEHR interoperability .\n Architected the next generation of patient-access and clinical workflow services on .NET 8 , establishing ASP.NET Core , Entity\nFramework Core , and domain-design patterns for scheduling, provider operations, and EHR interoperability .\n Defined domain boundaries and service ownership through Domain-Driven Design , enabling teams to develop, test, deploy, and\noperate modular .NET microservices independently.\n Established API standards for ASP.NET Core REST APIs , FHIR , and HL7 integrations, managing authentication, throttling,\nlifecycle policies, and partner access through Azure API Management .\n Designed a hybrid data strategy using SQL Server and T-SQL for on-premises transactions alongside Azure SQL , Cosmos DB ,\nand Azure Storage for cloud workloads.\n Built event-driven workflows with Azure Service Bus and Azure Functions to process appointment updates, synchronize\nclinical data, trigger provider notifications, and coordinate downstream services.\n Automated cloud infrastructure and delivery using Terraform , Docker , AKS , and Azure DevOps CI/CD , improving deployment\nconsistency across healthcare environments.\n Delivered patient and clinical workflows with Angular and TypeScript and built a separate Blazor administration tool for internal\nconfiguration and operational support, both backed by shared ASP.NET Core APIs .\n Designed an AI-assisted clinical operations workflow using Azure OpenAI , RAG , and Azure AI Search , enabling support\nteams to retrieve approved guidance with PHI redaction , audit logging, and human review.\n Protected sensitive health information through Microsoft Entra ID , RBAC , Azure Key Vault , and managed identities while\nsupporting HIPAA-compliant engineering practices.\n Expanded automated coverage with xUnit , Moq , and integration testing across APIs, persistence layers, asynchronous events,\nand healthcare system integrations.\n Improved operational visibility through Application Insights , Azure Log Analytics , and Grafana , helping teams identify service\ndegradation and production failures faster.\n Led architecture reviews , technical design sessions , code reviews , and production-readiness assessments while\nmentoring engineers and aligning product, clinical, security, and infrastructure stakeholders.\n\nAPPLE | Cupertino, CA 08/2021 - 12/2024\nSenior Software Engineer\nDesigned and delivered .NET 6/8 backend and automation services supporting internal manufacturing operations, equipment\nconfiguration, automated product testing, production telemetry , and engineering workflows.\n Engineered distributed .NET 6/8 services for manufacturing automation, connecting ASP.NET Core APIs with equipment\nconfiguration, product-test execution, and telemetry pipelines while reducing average processing latency by 13% .\n Modernized tightly coupled manufacturing applications into modular .NET services , improving fault isolation and deployment\nflexibility while reducing production incidents by 21% .\n Designed ASP.NET Core REST APIs for equipment commands and test-result submission, then exposed configuration,\ntelemetry, and quality data through GraphQL to React and TypeScript manufacturing dashboards.\n Built .NET event-processing components with Apache Kafka to ingest high-volume equipment telemetry , coordinate\nmanufacturing events, and support asynchronous test-result processing across distributed services .\n Improved manufacturing dashboards and test-analysis workflows by examining PostgreSQL query plans, adding targeted\nindexes , refining Dapper queries, and caching frequently accessed equipment data in Redis .\n Built GitHub Actions CI/CD pipelines that validated ASP.NET Core services with NUnit and Testcontainers , packaged\napproved builds as Docker images, and promoted them to Kubernetes .\n Added Polly retries and circuit breakers around equipment integrations, exposed dependency-readiness checks , and\ninstrumented services with OpenTelemetry so Datadog could identify production failures faster.\n Led technical design reviews , performance investigations , incident response , and capacity planning while mentoring\nengineers and collaborating with manufacturing, hardware-validation, infrastructure, and operations teams.\nHASHICORP | San Francisco, CA 09/2019 - 08/2021\nSenior Software Engineer\nDeveloped .NET Core platform services and enterprise integrations supporting secrets management , infrastructure\nprovisioning , tenant administration, and cloud operations.\n Advanced into cloud platform engineering by developing multi-tenant .NET Core services with ASP.NET Core and Entity\nFramework Core for enterprise accounts, workspaces, policy enforcement , and infrastructure-provisioning workflows.\n Designed ASP.NET Core REST APIs connecting internal applications and customer tools with HashiCorp Vault and Terraform\nautomation capabilities.\n Integrated .NET services with Vault APIs to retrieve dynamic credentials , manage application secrets , and replace long-lived\nconfiguration values across enterprise workloads.\n Developed serverless workflows with AWS Lambda , API Gateway , Amazon SQS , and DynamoDB for asynchronous\nprovisioning, policy updates, and cloud resource lifecycle operations.\n Created reusable Terraform modules that standardized AWS networking , compute, storage, and access-control\nconfigurations while improving provisioning consistency across environments.\n Strengthened platform security and reliability through tenant isolation , audit logging , policy-based authorization ,\nidempotent processing , and retry handling while partnering with product, security, and infrastructure teams.\nFARMERS INSURANCE | Woodland Hills, CA 03/2015 - 09/2019\nSoftware Engineer\nDeveloped and supported enterprise insurance applications built on the legacy Microsoft .NET Framework stack, establishing a\nfoundation in policy servicing , claims processing , systems integration , relational data , and production support .\n Built and enhanced policy-servicing applications using C# , ASP.NET Web Forms , and ASP.NET Web API on the .NET\nFramework , enabling agents to review coverage, update customer details, and process policy changes.\n Developed REST and WCF integrations that synchronized policy, billing, claims, customer, and document data across\nunderwriting and agent-service systems .\n Improved claims workflows by building reusable .NET business services and RabbitMQ-based background processing for\nvalidation, status updates, document handling, and exception recovery .\n Accelerated policy and claims searches by tuning SQL Server stored procedures , optimizing T-SQL queries , and adding\ntargeted indexes .\n Supported an AWS proof of concept for insurance document processing and scheduled workloads, gaining experience in cloud\ndeployment , monitoring , and troubleshooting .\n Improved release stability through MSTest , peer reviews , defect analysis , and automated build validation while collaborating\nwith QA, business analysts, and insurance operations teams.\nEDUCATION\nBachelor of Science in Business Information Technology, Virginia Tech 2010 - 2014",
    "salaryFloor": 120000,
    "school": "Virginia Tech(Virginia Polytechnic Institute and State University)",
    "state": "Texas",
    "tailoringMode": "base",
    "targetStack": "Full Stack C# / .NET / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "11+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "77054"
  },
  {
    "address": "11607 Curate Wind Ct",
    "archived": true,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "Baylor University"
    },
    "city": "Richmond",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 130000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "qweQWE123!@#",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 130000,
    "dob": "11/03/1993",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "mathbrbts@gmail.com"
    ],
    "firstName": "Matthew",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Matthew Roberts",
    "github": "",
    "graduationDate": "May 1, 2016",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1790706067441",
    "languagesFrameworks": {
      "comfortableLanguages": "Python, FastAPI, Django, Flask, Celery, Node.js, RESTful APIs, AI-Assisted Development, pytest, Unit Testing & Mocking (TDD), Generative AI & LLM Integration, React, Next.js, TypeScript, JavaScript, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "Python, FastAPI, Django, Flask, Celery, Node.js, RESTful APIs, AI-Assisted Development, pytest, Unit Testing & Mocking (TDD), Generative AI & LLM Integration",
      "preferredDatabase": "PostgreSQL, MySQL, Redis, AWS, Google Cloud (GCP), Docker, GitHub Actions, CI/CD, Git, Containerization, Continuous Integration & Automated Deployment, Relational Databases, Database Design & Optimization, In-Memory Caching",
      "preferredFrontend": "React, Next.js, TypeScript, JavaScript, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "python",
        "fastapi",
        "django",
        "flask",
        "celery",
        "node.js",
        "restful apis",
        "ai assisted development",
        "pytest",
        "unit testing   mocking  tdd",
        "generative ai   llm integration",
        "react",
        "next.js",
        "typescript",
        "javascript",
        "html5   css3",
        "responsive web design",
        "postgresql",
        "mysql",
        "redis",
        "aws",
        "google cloud  gcp",
        "docker",
        "github actions",
        "ci cd",
        "git",
        "containerization",
        "continuous integration   automated deployment",
        "relational databases",
        "database design   optimization",
        "in memory caching",
        "sql",
        "rest apis",
        "healthie",
        "candid",
        "hubspot",
        "fhir",
        "openapi",
        "snowflake",
        "react testing library",
        "playwright",
        "claude code",
        "sentry",
        "amazon cloudwatch"
      ]
    },
    "lastName": "Roberts",
    "linkedin": "linkedin.com/in/matt-roberts-25998588",
    "location": {
      "country": "United States",
      "resideState": "Texas",
      "willingToRelocate": "No"
    },
    "phone": "7139780329",
    "preferredName": "Matthew Roberts",
    "primaryEmail": "mathbrbts@gmail.com",
    "primaryStackKeywords": [
      "python",
      "fastapi",
      "django",
      "flask",
      "celery",
      "node.js",
      "restful apis",
      "ai assisted development",
      "pytest",
      "unit testing   mocking  tdd",
      "generative ai   llm integration",
      "react",
      "next.js",
      "typescript",
      "javascript",
      "html5   css3",
      "responsive web design",
      "postgresql",
      "mysql",
      "redis",
      "aws",
      "google cloud  gcp",
      "docker",
      "github actions",
      "ci cd",
      "git",
      "containerization",
      "continuous integration   automated deployment",
      "relational databases",
      "database design   optimization",
      "in memory caching",
      "sql",
      "rest apis",
      "healthie",
      "candid",
      "hubspot",
      "fhir",
      "openapi",
      "snowflake",
      "react testing library",
      "playwright",
      "claude code",
      "sentry",
      "amazon cloudwatch"
    ],
    "requiresSponsorship": "No",
    "resumeText": "MATTHEW ROBERTS\nSenior Software Engineer | Python Full-Stack Engineering & Healthcare Integrations\nRichmond, TX  |  (713) 978 0329  |  mathbrbts@gmail.com  |  linkedin.com/in/matt-roberts-25998588/\nPROFESSIONAL SUMMARY\nSenior Software Engineer with nearly 10 years of experience building full-stack applications across marketplace operations and healthcare consulting, connecting user workflows with dependable service and data behavior. Develops React and TypeScript interfaces backed by Python, FastAPI, and PostgreSQL, with experience integrating clinical and billing systems through recoverable API and webhook flows. Combines careful handling of sensitive data with automated testing, production diagnostics, and incremental delivery, helping product and operations partners turn ambiguous requirements into maintainable software.\nTECHNICAL SKILLS\nLanguages & Web Frameworks: Python, TypeScript, JavaScript, SQL, React, FastAPI, Django\nAPIs & Integration: REST APIs, Healthie, Candid, HubSpot, FHIR, OpenAPI\nData & Background Processing: PostgreSQL, Redis, Celery, Snowflake, MySQL\nCloud & Delivery: AWS, Docker, GitHub Actions, Git\nTesting & Development: pytest, React Testing Library, Playwright, Claude Code\nSupporting Frameworks & Diagnostics: Flask, Sentry, Amazon CloudWatch\nPROFESSIONAL EXPERIENCE\nSenior Software Engineer - Full-Stack Product Engineering | Integration Reliability\n10/2024 - 06/2026\nEtsy, Inc. | Remote\nBuilt Merchant Resolution Desk with React and FastAPI so support specialists could investigate account discrepancies without switching between disconnected operational tools.\nImplemented TypeScript form models with explicit pending and conflict states, preventing delayed responses from overwriting newer operator decisions.\nDesigned PostgreSQL transactions and uniqueness constraints around case updates, ensuring repeated submissions could not create contradictory adjustment records.\nOptimized SQL query paths after examining case-history joins, reducing workspace load time from 2.6 to 1.5 seconds during busy support periods.\nCreated Celery webhook consumers with replay protection and bounded retries, reducing duplicate downstream updates by 33% during partner outages.\nPublished OpenAPI contracts with representative failure responses, helping frontend engineers implement recoverable interactions without guessing backend validation behavior.\nCombined pytest integration coverage with React Testing Library interactions and Playwright journeys, catching regressions across service rules and operator workflows.\nUsed Claude Code to draft webhook edge-case tests and refactor parsing code, reviewing diffs and executing regression suites before accepting changes.\nBuilt Docker releases through GitHub Actions and monitored AWS deployments with Amazon CloudWatch, isolating startup failures before operators encountered broken workflows.\nLinked Sentry exceptions to redacted request identifiers and documented recovery steps, helping engineers diagnose integration failures without exposing unnecessary account information.\nSenior Architect - Healthcare Application Architecture | Clinical And Billing Integration\n07/2022 - 09/2024\nCredera\nDesigned Care Follow-Up Workspace with Django and React for a healthcare client coordinating patient outreach after incomplete appointments and billing exceptions.\nIntegrated Healthie appointment and patient records through scoped API access, giving coordinators current clinical context without copying entire medical histories.\nImplemented Healthie webhook reconciliation with source versions and replay checks, preventing delayed events from reversing newer appointment updates.\nBuilt Candid claim-submission adapters with validated identifiers, reducing rejected integration submissions by 35% through earlier detection of inconsistent encounter data.\nReconciled Candid processing responses against internal claim states, distinguishing accepted submissions from unresolved billing work requiring staff investigation.\nModeled PostgreSQL links between appointments, encounters, and follow-up tasks, preserving traceability while keeping clinical and billing state transitions separate.\nCreated React exception queues with role-specific details so coordinators could resolve operational issues without receiving unnecessary access to protected health information.\nAdded pytest fixtures for duplicate callbacks and partial patient updates, verifying recovery behavior before integration changes reached clinical operations.\nDocumented HIPAA-related access, retention, and log-redaction controls, helping client engineers troubleshoot failed exchanges without placing patient details in diagnostic records.\nSenior Software Engineer, Architect - Healthcare Web Applications | Operational Data Integration\n01/2021 - 07/2022\nCredera\nDeveloped Referral Review Console with Python and Django so care coordinators could investigate incomplete referrals through consistent records and explicit ownership.\nBuilt React correction forms with server-backed validation, helping coordinators resolve missing referral information before sending requests to downstream clinical systems.\nMapped FHIR patient and encounter resources into PostgreSQL references, preserving external identifiers so repeated imports updated existing records instead of creating duplicates.\nLoaded restricted operational extracts into Snowflake to support referral reporting without running analytical queries against the active coordination application.\nImplemented Snowflake reconciliation checks between source submissions and reporting tables, making missing updates visible before operations teams relied on incomplete dashboards.\nUsed Celery checkpoints and Redis reference caching to recover interrupted imports while keeping interactive referral review responsive.\nWrote pytest authorization and import regressions, protecting patient access boundaries and identifier consistency as client teams added referral sources.\nSenior Technical Consultant - Business Application Engineering | Customer System Integration\n10/2018 - 01/2021\nCredera\nBuilt Service Intake Portal with Django so a client could convert customer inquiries into assigned service requests without repeatedly copying information between systems.\nIntegrated HubSpot contact updates with internal customer records, normalizing identifiers so repeat inquiries attached to existing accounts rather than creating duplicates.\nAdded HubSpot synchronization checkpoints and exception reporting, enabling support staff to recover failed updates without replaying already completed customer changes.\nImplemented JavaScript validation and MySQL transaction checks to prevent incomplete service requests from being assigned before required customer information was available.\nCreated pytest fixtures for malformed API responses and repeated callbacks, protecting synchronization behavior when external platform fields changed.\nMaintained Git release notes and documented retry procedures, helping client engineers diagnose integration failures and safely support the portal after handoff.\nSoftware Engineer, Technology Consultant - Python Web Development | Data Validation\n08/2016 - 10/2018\nCredera\nImplemented Supplier Onboarding Register with Flask so procurement teams could review submissions through consistent records instead of manually merged departmental spreadsheets.\nBuilt Python field normalization and validation errors, allowing suppliers to correct missing identifiers without restarting otherwise complete onboarding submissions.\nAdded MySQL uniqueness constraints and migration checks to prevent duplicate suppliers while preserving references used by existing purchasing workflows.\nCreated JavaScript form dependencies that displayed relevant questions, reducing confusion when suppliers selected different organization types during registration.\nWrote pytest checks for malformed uploads and interrupted submissions, preventing recurring input failures from reaching client acceptance environments.\nInvestigated AWS application logs and documented environment configuration, helping senior engineers reproduce deployment problems and complete reliable client maintenance handoffs.\nEDUCATION\nBachelor of Science in Mathematics and Computer Science\n2016\nBaylor University\nTarget Job Description\nKey Responsibilities & Duties\n\nDesign, build, and ship full stack features across our Registry platform — frontend, backend, and database.\n\nBuild and maintain integrations with our core platforms, including Healthie (EMR), Candid (RCM), Spruce (messaging), and HubSpot.\n\nWrite and maintain APIs and webhooks that connect FamilyWell’s systems, with attention to idempotency, retries, and data reconciliation.\n\nDesign and evolve database schemas and queries (Postgres), balancing performance, data integrity, and clarity.\n\nPartner with Product, Data, and Clinical Operations to translate requirements into technical designs and shipped software.\n\nWrite unit, integration, and end-to-end tests; participate in code review and uphold engineering quality standards.\n\nSupport CI/CD pipelines, deployments, and monitoring/observability for the systems you build.\n\nFollow HIPAA and security best practices for handling protected health information (PHI).\n\nTroubleshoot and resolve production issues, working cross-functionally to identify root causes.\n\nMinimum Qualifications\n\n3–6+ years of professional software engineering experience as a full stack developer.\n\nProficiency with a modern JavaScript/TypeScript stack (e.g., React/Next.js on the frontend; Node.js or Python on the backend).\n\nStrong SQL skills and experience working with relational databases (Postgres preferred).\n\nExperience building and consuming REST APIs and integrating with third-party platforms/SaaS tools.\n\nComfort working across the full stack — from UI to backend services to data layer — rather than specializing in one layer only.\n\nStrong testing discipline and code quality habits (unit/integration testing, code review, documentation).\n\nAbility to work independently in a fast-paced, remote startup environment and communicate clearly with cross-functional partners.\n\nExperience using AI-powered development tools (e.g., Claude Code, GitHub Copilot, Cursor) to accelerate coding, testing, and debugging workflows.\n\nNice-to-Haves\n\nExperience in healthcare or another regulated industry, with familiarity with HIPAA and PHI handling.\n\nHands-on experience with healthcare platforms such as Healthie, Spruce, Candid, athenahealth, or similar EMR/RCM systems.\n\nHealthcare data experience — working with clinical, claims, or operational data in a warehouse/BI environment (e.g., Snowflake, dbt, Sigma).\n\nFamiliarity with healthcare data standards and interoperability (FHIR, HL7, X12/837-835).\n\nExperience with cloud infrastructure (AWS/GCP), containerization (Docker), and CI/CD tooling (GitHub Actions).\n\nPrior experience at an early-stage startup, comfortable with ambiguity and shifting priorities.\n\n \n\nCompensation\n\n $140,000-$155,000. While the anticipated range is within this band, flexibility may be limited based on the candidate’s experience and overall fit.",
    "salaryFloor": 120000,
    "school": "Baylor University",
    "state": "Texas",
    "tailoringMode": "tailored",
    "targetStack": "Full Stack Python / AI / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "10+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "77407"
  },
  {
    "address": "15374 SW 141st Ter",
    "archived": true,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "Millersville University"
    },
    "city": "Miami",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 130000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "qweQWE123!@#",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 130000,
    "dob": "07/07/1989",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "andrerobbrown0707@gmail.com"
    ],
    "firstName": "Andre",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Andre Robert Brown",
    "github": "",
    "graduationDate": "May 1, 2012",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1790707223110",
    "languagesFrameworks": {
      "comfortableLanguages": "Python, FastAPI, Django, Flask, Node.js, C++, RESTful APIs, Microservices, pytest, Jest, Distributed Systems, Unit Testing & Mocking (TDD), React, TypeScript, JavaScript, Vue.js, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "Python, FastAPI, Django, Flask, Node.js, C++, RESTful APIs, Microservices, pytest, Jest, Distributed Systems, Unit Testing & Mocking (TDD)",
      "preferredDatabase": "PostgreSQL, Amazon Aurora, AWS, AWS Lambda, Amazon S3, Docker, Terraform, GitHub Actions, CI/CD, Git, Containerization, Infrastructure as Code (IaC), Continuous Integration & Automated Deployment, Cloud Architecture, Relational Databases, Database Design & Optimization",
      "preferredFrontend": "React, TypeScript, JavaScript, Vue.js, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "python",
        "fastapi",
        "django",
        "flask",
        "node.js",
        "c++",
        "restful apis",
        "microservices",
        "pytest",
        "jest",
        "distributed systems",
        "unit testing   mocking  tdd",
        "react",
        "typescript",
        "javascript",
        "vue.js",
        "html5   css3",
        "responsive web design",
        "postgresql",
        "amazon aurora",
        "aws",
        "aws lambda",
        "amazon s3",
        "docker",
        "terraform",
        "github actions",
        "ci cd",
        "git",
        "containerization",
        "infrastructure as code  iac",
        "continuous integration   automated deployment",
        "cloud architecture",
        "relational databases",
        "database design   optimization",
        "rest apis",
        "openapi",
        "html5",
        "css3",
        "wcag 2.1 aa",
        "geojson",
        "postgis",
        "ogc api",
        "wms",
        "wfs",
        "aws fargate",
        "amazon aurora postgresql",
        "api gateway",
        "cypress",
        "ruff",
        "black",
        "dependabot"
      ]
    },
    "lastName": "Brown",
    "linkedin": "linkedin.com/in/andrbwn",
    "location": {
      "country": "United States",
      "resideState": "Florida",
      "willingToRelocate": "No"
    },
    "phone": "7869274881",
    "preferredName": "Andre Robert Brown",
    "primaryEmail": "andrerobbrown0707@gmail.com",
    "primaryStackKeywords": [
      "python",
      "fastapi",
      "django",
      "flask",
      "node.js",
      "c++",
      "restful apis",
      "microservices",
      "pytest",
      "jest",
      "distributed systems",
      "unit testing   mocking  tdd",
      "react",
      "typescript",
      "javascript",
      "vue.js",
      "html5   css3",
      "responsive web design",
      "postgresql",
      "amazon aurora",
      "aws",
      "aws lambda",
      "amazon s3",
      "docker",
      "terraform",
      "github actions",
      "ci cd",
      "git",
      "containerization",
      "infrastructure as code  iac",
      "continuous integration   automated deployment",
      "cloud architecture",
      "relational databases",
      "database design   optimization",
      "rest apis",
      "openapi",
      "html5",
      "css3",
      "wcag 2.1 aa",
      "geojson",
      "postgis",
      "ogc api",
      "wms",
      "wfs",
      "aws fargate",
      "amazon aurora postgresql",
      "api gateway",
      "cypress",
      "ruff",
      "black",
      "dependabot"
    ],
    "requiresSponsorship": "No",
    "resumeText": "ANDRE ROBERT BROWN\nSenior Software Engineer | Python Full-Stack & Geospatial API Engineering\nMiami, FL  |  (786) 927 4881  |  andrerobbrown0707@gmail.com  |  linkedin.com/in/andrbwn/\nPROFESSIONAL SUMMARY\nSenior Software Engineer with 8+ years of experience building full-stack web applications, public-facing APIs, and cloud-hosted data platforms across consulting and technology environments. Develops Python and FastAPI services, TypeScript and React interfaces, PostgreSQL-backed geospatial workflows, and AWS infrastructure for data-intensive applications requiring reliable API delivery. Combines API architecture, accessibility, automated testing, infrastructure as code, production observability, and technical leadership to modernize complex systems while maintaining clear engineering standards and dependable release processes.\nTECHNICAL SKILLS\nLanguages & Backend: Python, TypeScript, JavaScript, FastAPI, REST APIs, OpenAPI\nFrontend Engineering: React, HTML5, CSS3, WCAG 2.1 AA\nGeospatial & Data Standards: GeoJSON, PostGIS, OGC API, WMS, WFS\nCloud & Data: AWS, AWS Fargate, Amazon Aurora PostgreSQL, Amazon S3, AWS Lambda, API Gateway\nDevOps & Infrastructure: Docker, Terraform, Git, GitHub Actions, CI/CD\nTesting & Quality: pytest, Jest, Cypress, Ruff, Black, Dependabot\nPROFESSIONAL EXPERIENCE\nSenior Software Engineer - Full-Stack Platform Engineering | Geospatial APIs\n03/2025 - 05/2026\nAccenture LLP | Chicago, IL | Remote\nOwned engineering for HydroView, a cloud-hosted environmental data platform that exposed time-sensitive spatial datasets through public web interfaces and integration APIs.\nDesigned FastAPI microservices around forecast and mapping datasets because large payloads and tightly coupled endpoints made existing services difficult to scale independently.\nImplemented REST APIs with OpenAPI contracts so internal and external consumers could integrate against stable schemas while backend processing evolved independently.\nBuilt OGC-compatible WMS and WFS endpoints for spatial layers, allowing mapping clients to consume standardized geographic data without custom integration logic.\nStored application metadata and spatial records in Amazon Aurora PostgreSQL with PostGIS, enabling efficient bounding-box and proximity queries across large geographic datasets.\nDeployed containerized Python services on AWS Fargate because variable API demand required independent scaling without maintaining dedicated application servers.\nUsed Amazon S3 for large raster and export artifacts while AWS Lambda handled asynchronous preprocessing, keeping heavy data transformations outside interactive API requests.\nDeveloped TypeScript and React interfaces for interactive maps and data inspection, connecting frontend state to GeoJSON APIs while preserving responsive behavior across device sizes.\nApplied WCAG 2.1 AA patterns to keyboard navigation, focus management, semantic controls, and map-adjacent content so critical information remained accessible beyond visual interaction.\nBuilt pytest, Jest, and Cypress test suites around API contracts and user workflows, increasing automated coverage while catching cross-layer regressions before deployment.\nProvisioned application infrastructure with Terraform and GitHub Actions, creating repeatable CI/CD promotion paths for container, database, storage, and API changes.\nReviewed architecture and pull requests with engineers, focusing on API compatibility, accessibility, spatial-data performance, and release safety across shared platform components.\nSenior Software Engineer - API Platform Engineering | Cloud Data Applications\n01/2021 - 02/2025\nKPMG International | New York, NY | Remote\nDelivered full-stack data platforms for consulting clients whose teams needed secure web applications, external APIs, and reliable processing of large structured and spatial datasets.\nBuilt Python and FastAPI services for data retrieval and transformation because monolithic request handlers made performance tuning and contract changes difficult to isolate.\nDefined OpenAPI specifications for REST integrations, giving client and partner teams versioned contracts while allowing implementations to change behind stable interfaces.\nImplemented GeoJSON endpoints and PostGIS queries for location-aware workflows, reducing client-side transformation and keeping spatial filtering close to the underlying data.\nDeveloped TypeScript and React interfaces for map-based search and analytical workflows, using reusable components to keep interaction behavior consistent across multiple views.\nApplied accessibility checks to forms, navigation, tab order, labels, and dynamic content because client-facing applications had to support keyboard and assistive-technology users.\nDeployed Dockerized services through AWS Fargate with Amazon S3-backed data storage, separating stateless API workloads from large generated files and datasets.\nBuilt AWS Lambda jobs for scheduled imports and transformation tasks, reducing pressure on web services while allowing failed jobs to be retried independently.\nOptimized PostgreSQL and PostGIS queries through indexing and query-plan analysis, reducing several spatial lookup paths from multi-second execution to interactive response times.\nCreated pytest and Jest suites for backend and frontend behavior, then integrated them into GitHub Actions so contract and regression failures blocked promotion automatically.\nUsed Terraform to provision repeatable AWS environments, reducing configuration drift while making infrastructure changes reviewable alongside application code.\nMentored engineers through design and code reviews involving API boundaries, geospatial queries, testing strategy, accessibility, and production troubleshooting.\nSoftware Engineer - Full-Stack Application Engineering | Data Visualization\n04/2018 - 12/2020\nFleet Advantage | Fort Lauderdale, FL (Hybrid)\nDeveloped FleetPulse, a web application that consolidated vehicle, maintenance, financial, and location records for operational analysis and reporting.\nBuilt Python REST APIs for fleet and location data because inconsistent external feeds required validation before records could safely enter reporting workflows.\nDeveloped JavaScript and React interfaces for searchable fleet dashboards, giving analysts faster access to vehicle history and geographically relevant operational information.\nStored operational records in PostgreSQL and added targeted indexes, reducing common search and reporting workflows by approximately 40%.\nReturned location data as GeoJSON for map visualization, avoiding repeated browser-side conversions while keeping geographic serialization consistent across clients.\nExpanded pytest coverage around imports, validation, and API behavior because changing partner formats created recurring regression risk.\nUsed Git and CI/CD checks to validate application changes before deployment, improving release consistency while documenting recovery procedures for failed integrations.\nEDUCATION\nBachelor of Science in Computer Science\n2012\nMillersville University, PA\nTarget Job Description\nWork Model: Remote | Location: United States\n\nDescription\nThe Sr. Full-Stack/API Developer serves as a senior feature lead and full-stack software engineer responsible for architecting, building, and deploying new web capabilities and RESTful APIs. This position drives the technical modernization of the National Water Prediction Service (NWPS), leading feature development for dynamic hydrographs, interactive displays for NOAA Atlas 15 precipitation frequency estimates, and expanded Flood Inundation Mapping (FIM) visualization tools.\n\nOperating within the NWS Enterprise Cloud (NEC) Amazon Web Services (AWS) environment, the Sr. Full-Stack/API Developer designs scalable microservices using AWS Fargate, Amazon Aurora PostgreSQL, and S3. This role leads complex API integrations including spatial web services leveraging Esri ArcGIS Enterprise on Linux and Open Geospatial Consortium (OGC) standards builds automated test harnesses, enforces WCAG 2.1 AA accessibility guidelines, and collaborates on community-driven code contribution workflows.\n\nRequirements\n• Feature Development: Lead the full-stack design and implementation of major modernization initiatives for NWPS, including interactive displays for NOAA Atlas 15 present/future precipitation estimates, watershed delineation tools, and high-resolution FIM visualizers.\n• API Microservices Architecture: Architect, implement, and optimize high-throughput RESTful APIs and OGC-compliant spatial data services (WMS, WFS, OGC API - Features/EDR) to stream real-time water prediction datasets.\n• Frontend UI & Geospatial Interfaces: Build mobile-responsive, accessible web user interfaces for NWPS using modern JavaScript/TypeScript and web mapping frameworks, strictly adhering to WCAG 2.1 AA and Section 508 compliance.\n• GIS & HydroVIS Integration: Interface backend data services with the Government-managed Hydrologic Visualization and Information Services (HydroVIS) platform running Esri ArcGIS Enterprise on Linux.\n• Automated QA & Pipeline Integration: Build automated unit, integration, and end-to-end testing harnesses (Pytest, Jest, Cypress) to enforce the contract's mandatory =80% statement test coverage threshold and maintain 0 medium/high static linting errors prior to CI/CD promotion.\n• Technical Leadership & Peer Review: Conduct rigorous peer code reviews for internal developers and external community code contributors, mentor mid-level staff, and prepare technical release artifacts for NOAA Change Control Board (CCB) approvals.\n\nExperience Required\n• Education: Bachelor’s Degree in Computer Science, Software Engineering, Information Systems, or a related computational field.\n• Total Professional Experience: Minimum of 5 years (with 8+ years highly preferred) of progressive experience in full-stack web application development and API engineering.\n• Development & System Design: Proven track record designing, building, and launching public-facing RESTful APIs, cloud microservices, and interactive geospatial web applications.\n• Agile & DevSecOps: Demonstrated experience working in Agile/Scrum delivery cadences, managing merge/pull requests in VLab GitLab or GitHub, and integrating automated CI/CD testing gates.\n\nTechnical Skills Required\n• Backend Languages & Frameworks: Proficiency in Python (FastAPI, Flask, Django, PEP 8), Go, Node.js, and/or C/C++.\n• Frontend Technologies: Expertise in JavaScript/TypeScript, modern web frameworks (React, Vue, or modern ES6+ vanilla JS), HTML5/CSS3, and accessibility standards (WCAG 2.1 AA / Section 508).\n• Spatial Formats & API Standards: Deep experience with RESTful API design, OpenAPI specifications, OGC web standards, GeoJSON, Cloud-Optimized GeoTIFFs (COGs), Zarr, and NetCDF formats.\n• AWS Cloud Services & Databases: Direct experience with AWS Fargate/ECS, Amazon Aurora PostgreSQL / PostGIS, Amazon S3, AWS Lambda, and API Gateway.\n• DevOps & QA Frameworks: Proficiency with Docker, Terraform Infrastructure as Code, Pytest, Jest, and static analysis/security tools (Ruff, Flake8, Black, Dependabot).",
    "salaryFloor": 120000,
    "school": "Millersville University",
    "state": "Florida",
    "tailoringMode": "tailored",
    "targetStack": "Full Stack Python / AI / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "8+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "33196"
  },
  {
    "address": "15070 SW 119th Ln",
    "archived": false,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "University of Houston"
    },
    "city": "Miami",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 140000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "@amon=17#55R",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 140000,
    "dob": "04/01/1997",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "ramiramon245@gmail.com"
    ],
    "firstName": "Ramon",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Ramon Ramirez",
    "github": "",
    "graduationDate": "May 1, 2018",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1793331952860",
    "languagesFrameworks": {
      "comfortableLanguages": "C#, .NET 8, .NET Framework, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, Entity Framework Core, Dapper, LINQ, Dependency Injection, RESTful APIs, Microservices, Distributed Systems, Clean Architecture, Domain-Driven Design (DDD), Event-Driven Architecture, Azure OpenAI, OpenAI API, Retrieval-Augmented Generation (RAG), AI-Assisted Development, xUnit, NUnit, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration, React, TypeScript, JavaScript, Angular, HTML5 / CSS3, Responsive Design, Responsive Web Design",
      "preferredBackend": "C#, .NET 8, .NET Framework, .NET, ASP.NET Core, ASP.NET Web API, ASP.NET MVC, Entity Framework Core, Dapper, LINQ, Dependency Injection, RESTful APIs, Microservices, Distributed Systems, Clean Architecture, Domain-Driven Design (DDD), Event-Driven Architecture, Azure OpenAI, OpenAI API, Retrieval-Augmented Generation (RAG), AI-Assisted Development, xUnit, NUnit, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration",
      "preferredDatabase": "SQL Server, PostgreSQL, T-SQL, Redis, Azure Service Bus, Amazon SNS / SQS, Microsoft Azure, AWS, Azure Functions, Amazon S3, Docker, Kubernetes, Azure DevOps, GitHub Actions, Jenkins, CI/CD, Git, Containerization, Container Orchestration, Continuous Integration & Automated Deployment, Cloud Architecture, Relational Databases, Database Design & Optimization, Event-Driven Architecture, In-Memory Caching",
      "preferredFrontend": "React, TypeScript, JavaScript, Angular, HTML5 / CSS3, Responsive Design, Responsive Web Design",
      "skills": [
        "c#",
        ".net 8",
        ".net framework",
        ".net",
        "asp.net core",
        "asp.net web api",
        "asp.net mvc",
        "entity framework core",
        "dapper",
        "linq",
        "dependency injection",
        "restful apis",
        "microservices",
        "distributed systems",
        "clean architecture",
        "domain driven design  ddd",
        "event driven architecture",
        "azure openai",
        "openai api",
        "retrieval augmented generation  rag",
        "ai assisted development",
        "xunit",
        "nunit",
        "asynchronous messaging",
        "unit testing   mocking  tdd",
        "generative ai   llm integration",
        "react",
        "typescript",
        "javascript",
        "angular",
        "html5   css3",
        "responsive design",
        "responsive web design",
        "sql server",
        "postgresql",
        "t sql",
        "redis",
        "azure service bus",
        "amazon sns   sqs",
        "microsoft azure",
        "aws",
        "azure functions",
        "amazon s3",
        "docker",
        "kubernetes",
        "azure devops",
        "github actions",
        "jenkins",
        "ci cd",
        "git",
        "containerization",
        "container orchestration",
        "continuous integration   automated deployment",
        "cloud architecture",
        "relational databases",
        "database design   optimization",
        "in memory caching",
        ".net 6 8",
        "web api",
        "rest apis",
        "async await",
        "openapi",
        "api versioning",
        "pagination",
        "request validation",
        "react  hooks",
        "angular  reactive forms",
        "html",
        "css",
        "keyboard",
        "accessibility",
        "solid",
        "object oriented design",
        "design patterns",
        "ef core  migrations",
        "cosmos db",
        "azure",
        "blob storage",
        "optimistic concurrency",
        "cache invalidation",
        "data modeling",
        "schema design",
        "etl pipelines",
        "azure app service",
        "azure key vault",
        "aws sqs",
        "s3",
        "concurrency",
        "idempotency",
        "dead letter queues",
        "bicep",
        "azure devops ci cd",
        "playwright",
        "unit testing",
        "integration testing",
        "opentelemetry",
        "application",
        "insights",
        "cloudwatch",
        "entra id",
        "openid connect",
        "jwt",
        "role based authorization",
        "tenant isolation",
        "github copilot",
        "azure ai search"
      ]
    },
    "lastName": "Ramirez",
    "linkedin": "linkedin.com/in/ramonrami",
    "location": {
      "country": "United States",
      "resideState": "Florida",
      "willingToRelocate": "No"
    },
    "phone": "7866778838",
    "preferredName": "Ramon Ramirez",
    "primaryEmail": "ramiramon245@gmail.com",
    "primaryStackKeywords": [
      "c#",
      ".net 8",
      ".net framework",
      ".net",
      "asp.net core",
      "asp.net web api",
      "asp.net mvc",
      "entity framework core",
      "dapper",
      "linq",
      "dependency injection",
      "restful apis",
      "microservices",
      "distributed systems",
      "clean architecture",
      "domain driven design  ddd",
      "event driven architecture",
      "azure openai",
      "openai api",
      "retrieval augmented generation  rag",
      "ai assisted development",
      "xunit",
      "nunit",
      "asynchronous messaging",
      "unit testing   mocking  tdd",
      "generative ai   llm integration",
      "react",
      "typescript",
      "javascript",
      "angular",
      "html5   css3",
      "responsive design",
      "responsive web design",
      "sql server",
      "postgresql",
      "t sql",
      "redis",
      "azure service bus",
      "amazon sns   sqs",
      "microsoft azure",
      "aws",
      "azure functions",
      "amazon s3",
      "docker",
      "kubernetes",
      "azure devops",
      "github actions",
      "jenkins",
      "ci cd",
      "git",
      "containerization",
      "container orchestration",
      "continuous integration   automated deployment",
      "cloud architecture",
      "relational databases",
      "database design   optimization",
      "in memory caching",
      ".net 6 8",
      "web api",
      "rest apis",
      "async await",
      "openapi",
      "api versioning",
      "pagination",
      "request validation",
      "react  hooks",
      "angular  reactive forms",
      "html",
      "css",
      "keyboard",
      "accessibility",
      "solid",
      "object oriented design",
      "design patterns",
      "ef core  migrations",
      "cosmos db",
      "azure",
      "blob storage",
      "optimistic concurrency",
      "cache invalidation",
      "data modeling",
      "schema design",
      "etl pipelines",
      "azure app service",
      "azure key vault",
      "aws sqs",
      "s3",
      "concurrency",
      "idempotency",
      "dead letter queues",
      "bicep",
      "azure devops ci cd",
      "playwright",
      "unit testing",
      "integration testing",
      "opentelemetry",
      "application",
      "insights",
      "cloudwatch",
      "entra id",
      "openid connect",
      "jwt",
      "role based authorization",
      "tenant isolation",
      "github copilot",
      "azure ai search"
    ],
    "requiresSponsorship": "No",
    "resumeText": "Ramon Ramirez\nSenior Software Engineer | .NET Architect | Full Stack .NET Engineer | Azure Cloud Engineer\nMiami, FL | 786 677 8838 | ramiramon245@gmail.com | linkedin.com/in/ramonrami\nSenior C# / .NET engineer with 10 years across the software development lifecycle . Leads Azure cloud\narchitecture , performance tuning, and production support; mentors engineers and communicates technical trade-offs.\nProfessional Experience\nAccenture LLP Oct 2025 - Oct 2026\nSenior Software Engineer | .NET Architect | Azure Cloud Engineer Chicago, IL | Remote\n• Led cloud architecture and hands-on delivery of 4 employee approval services, migrating .NET Framework to\nC#/ .NET 8 and ASP.NET Core while preserving client submission and review integrations.\n• Separated approval rules, workflow orchestration, and persistence with Clean Architecture , DDD , SOLID, and\ndependency injection, making policy changes testable without rewriting integrations.\n• Reduced approval-search p95 latency from 1.1 seconds to 650 milliseconds in load tests by tuning SQL Server\nindexes and EF Core queries with LINQ projections.\n• Mentored 4 engineers through design reviews and Git pull requests, using xUnit and integration-test checks to\nvalidate approval behavior and GitHub Copilot -assisted changes against acceptance criteria.\n• Built versioned REST APIs with asynchronous EF Core access, request validation, and consistent error responses,\npreserving client contracts as approval policies evolved.\n• Built responsive React and TypeScript forms with reusable components and React hooks for request status,\nvalidation, and submission, adding keyboard accessibility for employees and approvers.\n• Enforced role-based authorization with Entra ID , OpenID Connect, and JWT validation , checking token issuer and\naudience while keeping service credentials in Azure Key Vault.\n• Automated Azure App Service releases with Bicep and Azure DevOps CI/CD , cutting deployment time from 45 to\n18 minutes with test gates, controlled configuration, and rollback.\n• Led production debugging with Application Insights and OpenTelemetry , tracing stalled approvals to API and\ndependency failures; documented root-cause analysis, recovery runbooks, and regression tests.\n• Led client communication and release planning, translating approval policies into acceptance criteria, effort\nestimates, and Agile sprint plans while resolving scope and implementation trade-offs.\n• Built a RAG prototype with Azure OpenAI and Azure AI Search , combining permission-filtered policy retrieval with\ncitation checks and answer evaluation before proposing workflow integration.\nBuildWitt Feb 2022 - Oct 2025\nSenior Software Engineer | Full Stack .NET Engineer Nashville, TN | Remote\n• Owned construction-training workflows from C#/.NET services to Angular reactive forms and TypeScript, partnering\nwith product managers on assignments, enrollment corrections, completions, and supervisor reporting.\n• Led data modeling and schema design in EF Core and SQL Server , using constraints and optimistic concurrency\nto preserve tenant-scoped completion history during reassignments and concurrent edits.\n• Evolved enrollment schemas with EF Core migrations and controlled backfills, validating historical completions\nbefore switching application reads to updated models.\n• Decoupled completion processing with Azure Functions and Service Bus microservices, using idempotent\nconsumers, bounded retries, and dead-letter queues to recover interrupted updates without duplicating progress.\n• Stored lesson videos in Azure Blob Storage and training metadata in Cosmos DB , aligning tenant access controls,\nretention, and content retrieval with each customer's library.\n• Cut progress-report generation from 12 to 4 seconds on equivalent datasets by tuning SQL Server queries and\ncaching repeated supervisor summaries in Redis .\n• Protected 24 enrollment and completion scenarios with Playwright checks in GitHub Actions, catching tenant-\naccess and workflow errors before supervisors received a release.\n• Directed the .NET 6 to .NET 8 service upgrade, resolving package compatibility and using Docker images,\nKubernetes health checks, and tested rollback for staged releases.\n• Established Application Insights alerts and recovery runbooks for recurring completion failures, reducing median\ndiagnosis time from 50 to 30 minutes .\n1\n\nMoz Dec 2020 - Feb 2022\nSoftware Engineer | .NET Backend Engineer Seattle, WA | Remote\n• Built C# reporting APIs and ETL pipelines to validate and transform crawl and ranking data for SEO dashboards\nand scheduled exports, keeping interactive and batch reporting consistent.\n• Separated export execution from dashboard requests with AWS SQS workers and S3 delivery, allowing large\nreports to finish independently without blocking customer analysis.\n• Shortened scheduled exports from 12 to 7 minutes on equivalent datasets by tuning PostgreSQL joins and\nretrieving report rows in manageable batches.\n• Defined REST pagination, API versioning , and error contracts with frontend engineers; documented OpenAPI\nschemas so dashboard integrations stayed stable as reporting models evolved.\n• Reduced worker peak memory from 900 to 600 MB in equivalent load tests through streaming, bounded\nconcurrency, and async/await ; propagated cancellation to stop abandoned work.\n• Implemented Redis cache invalidation after new crawl data arrived, keeping frequently requested ranking\nsummaries current without repeating database work.\n• Added NUnit integration testing for report schemas and monitored CloudWatch after releases to verify that\nscheduled jobs continued producing complete customer exports.\nHines Oct 2016 - Nov 2020\nSoftware Engineer | .NET Backend Engineer Houston, Texas\n• Developed C#/.NET Framework APIs for property operations with senior engineers, supporting tenant service\nrequests, work-order assignments, and status tracking across building teams.\n• Added idempotency checks to repeated work-order updates, reducing duplicate records from 0.6% to 0.2% in\nreplay tests and preserving consistent request histories for property managers.\n• Reduced nightly work-order reconciliation from 40 to 28 minutes for unchanged batches by tuning T-SQL stored\nprocedures and batching SQL Server lookups through Dapper.\n• Built ASP.NET MVC operations views for request prioritization, assignment, and exception review, applying\nproperty-scoped access and audit trails to help building teams resolve overdue maintenance.\n• Converted reopened requests, concurrent status changes, and failed imports into xUnit regression tests with QA,\nvalidating workflow transitions and transactional updates before property-system releases.\nTechnical Skills\n.NET and APIs: C#, .NET 6/8, .NET Framework, ASP.NET Core, ASP.NET MVC, Web API, REST APIs, async/await,\nOpenAPI, API versioning, pagination, request validation\nFrontend: React (hooks), Angular (reactive forms), TypeScript, JavaScript, HTML, CSS, responsive design, keyboard\naccessibility\nArchitecture: Clean Architecture, domain-driven design (DDD), SOLID, dependency injection, object-oriented design,\ndesign patterns, microservices, event-driven architecture, distributed systems, cloud architecture\nData and storage: SQL Server, PostgreSQL, T-SQL, EF Core (migrations), LINQ, Dapper, Redis, Cosmos DB, Azure\nBlob Storage, optimistic concurrency, cache invalidation, data modeling, schema design, ETL pipelines\nCloud and integration: Azure App Service, Azure Functions, Azure Service Bus, Azure Key Vault, AWS SQS, S3,\nconcurrency, idempotency, dead-letter queues\nDelivery: Git, Bicep, Docker, Kubernetes, Azure DevOps CI/CD, GitHub Actions, Jenkins\nTesting and observability: xUnit, NUnit, Playwright, unit testing, integration testing, OpenTelemetry, Application\nInsights, CloudWatch\nIdentity and security: Entra ID, OpenID Connect, JWT, role-based authorization, tenant isolation\nAI tools: GitHub Copilot, Azure OpenAI, Azure AI Search, retrieval-augmented generation (RAG)\nEducation\nUniversity of Houston | 2018\nBachelor of Science in Computer Science\n2",
    "salaryFloor": 120000,
    "school": "University of Houston",
    "state": "Florida",
    "tailoringMode": "base",
    "targetStack": "Full Stack C# / .NET / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "8+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "33196"
  },
  {
    "address": "14152 SW 154th Ct",
    "archived": false,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "The University of Kansas"
    },
    "city": "Miami",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 140000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "J@sonk0328@*",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 140000,
    "dob": "10/13/1991",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "jackomontguru@gmail.com"
    ],
    "firstName": "Jack",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Jack Montgomery",
    "github": "",
    "graduationDate": "May 1, 2016",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1793349216414",
    "languagesFrameworks": {
      "comfortableLanguages": "C#, .NET 8, .NET Framework, .NET, ASP.NET Core, ASP.NET MVC, Entity Framework Core, Entity Framework, LINQ, WCF, Python, RESTful APIs, Microservices, Event-Driven Architecture, AI-Assisted Development, xUnit, NUnit, Moq, Distributed Systems, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration, React, TypeScript, JavaScript, Angular, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "C#, .NET 8, .NET Framework, .NET, ASP.NET Core, ASP.NET MVC, Entity Framework Core, Entity Framework, LINQ, WCF, Python, RESTful APIs, Microservices, Event-Driven Architecture, AI-Assisted Development, xUnit, NUnit, Moq, Distributed Systems, Asynchronous Messaging, Unit Testing & Mocking (TDD), Generative AI & LLM Integration",
      "preferredDatabase": "SQL Server, PostgreSQL, Oracle Database, T-SQL, Amazon RDS, Redis, Azure Service Bus, Microsoft Azure, AWS, Azure Kubernetes Service (AKS), Amazon S3, Docker, Kubernetes, Terraform, Azure DevOps, GitHub Actions, CI/CD, Git, Containerization, Container Orchestration, Infrastructure as Code (IaC), Continuous Integration & Automated Deployment, Cloud Architecture, Relational Databases, Database Design & Optimization, Event-Driven Architecture, In-Memory Caching",
      "preferredFrontend": "React, TypeScript, JavaScript, Angular, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "c#",
        ".net 8",
        ".net framework",
        ".net",
        "asp.net core",
        "asp.net mvc",
        "entity framework core",
        "entity framework",
        "linq",
        "wcf",
        "python",
        "restful apis",
        "microservices",
        "event driven architecture",
        "ai assisted development",
        "xunit",
        "nunit",
        "moq",
        "distributed systems",
        "asynchronous messaging",
        "unit testing   mocking  tdd",
        "generative ai   llm integration",
        "react",
        "typescript",
        "javascript",
        "angular",
        "html5   css3",
        "responsive web design",
        "sql server",
        "postgresql",
        "oracle database",
        "t sql",
        "amazon rds",
        "redis",
        "azure service bus",
        "microsoft azure",
        "aws",
        "azure kubernetes service  aks",
        "amazon s3",
        "docker",
        "kubernetes",
        "terraform",
        "azure devops",
        "github actions",
        "ci cd",
        "git",
        "containerization",
        "container orchestration",
        "infrastructure as code  iac",
        "continuous integration   automated deployment",
        "cloud architecture",
        "relational databases",
        "database design   optimization",
        "in memory caching",
        "sql",
        "powershell",
        "html5",
        "css3",
        "json",
        "xml",
        ".net.net core",
        "rest apis",
        "soap",
        "openapi swagger",
        "wpf",
        "xaml",
        "oracle integration",
        "ssis",
        "ssrs",
        "azure app service",
        "azure kubernetes service",
        "azure key vault",
        "amazon ec2",
        "aws codepipeline",
        "aws codedeploy",
        "amazon cloudwatch",
        "iis",
        "windows server",
        "playwright",
        "application insights",
        "opentelemetry",
        "github copilot",
        "claude code",
        "microsoft entra id",
        "active directory",
        "oauth 2.0",
        "openid connect",
        "jwt"
      ]
    },
    "lastName": "Montgomery",
    "linkedin": "https://www.linkedin.com/in/jackson-m-75428664",
    "location": {
      "country": "United States",
      "resideState": "FL",
      "willingToRelocate": "No"
    },
    "phone": "7863968297",
    "preferredName": "Jack Montgomery",
    "primaryEmail": "jackomontguru@gmail.com",
    "primaryStackKeywords": [
      "c#",
      ".net 8",
      ".net framework",
      ".net",
      "asp.net core",
      "asp.net mvc",
      "entity framework core",
      "entity framework",
      "linq",
      "wcf",
      "python",
      "restful apis",
      "microservices",
      "event driven architecture",
      "ai assisted development",
      "xunit",
      "nunit",
      "moq",
      "distributed systems",
      "asynchronous messaging",
      "unit testing   mocking  tdd",
      "generative ai   llm integration",
      "react",
      "typescript",
      "javascript",
      "angular",
      "html5   css3",
      "responsive web design",
      "sql server",
      "postgresql",
      "oracle database",
      "t sql",
      "amazon rds",
      "redis",
      "azure service bus",
      "microsoft azure",
      "aws",
      "azure kubernetes service  aks",
      "amazon s3",
      "docker",
      "kubernetes",
      "terraform",
      "azure devops",
      "github actions",
      "ci cd",
      "git",
      "containerization",
      "container orchestration",
      "infrastructure as code  iac",
      "continuous integration   automated deployment",
      "cloud architecture",
      "relational databases",
      "database design   optimization",
      "in memory caching",
      "sql",
      "powershell",
      "html5",
      "css3",
      "json",
      "xml",
      ".net.net core",
      "rest apis",
      "soap",
      "openapi swagger",
      "wpf",
      "xaml",
      "oracle integration",
      "ssis",
      "ssrs",
      "azure app service",
      "azure kubernetes service",
      "azure key vault",
      "amazon ec2",
      "aws codepipeline",
      "aws codedeploy",
      "amazon cloudwatch",
      "iis",
      "windows server",
      "playwright",
      "application insights",
      "opentelemetry",
      "github copilot",
      "claude code",
      "microsoft entra id",
      "active directory",
      "oauth 2.0",
      "openid connect",
      "jwt"
    ],
    "requiresSponsorship": "No",
    "resumeText": "Jack Montgomery\n(786) 396-8297 | jackomontguru@gmail.com | https://www.linkedin.com/in/jackson-m-75428664/\nSKILLS\n● C#, SQL, T-SQL, TypeScript, JavaScript, Python, PowerShell, HTML5, CSS3, JSON, XML\n● .NET.NET Core, ASP.NET Core, ASP.NET MVC, REST APIs, SOAP, WCF, LINQ, OpenAPI/Swagger\n● React, Angular, WPF, XAML\n● SQL Server, PostgreSQL, Oracle integration, Redis, Entity Framework, Entity Framework Core, SSIS, SSRS\n● Azure App Service, Azure Kubernetes Service, Azure Service Bus, Azure Key Vault\n● Amazon EC2, Amazon RDS, Amazon S3, AWS CodePipeline, AWS CodeDeploy, Amazon CloudWatch\n● Git, Azure DevOps, GitHub Actions, Docker, Kubernetes, Terraform, IIS, Windows Server\n● xUnit, NUnit, Moq, Playwright, Application Insights, OpenTelemetry, GitHub Copilot, Claude Code\n● Microsoft Entra ID, Active Directory, OAuth 2.0, OpenID Connect, JWT\nPROFESSIONAL EXPERIENCE\nGoodRx Oct 2023 – Aug 2026\nSenior Software Engineer\n● Developed Soreli (Consumer prescription search and discounts), an ASP.NET Core and React prescription-savings\napplication, helping consumers compare pharmacy prices and retrieve discounts through C#/.NET REST APIs .\n● Optimized SQL Server indexes and Entity Framework Core LINQ queries, reducing p95 offer-search latency from 1.8\nseconds to 700 milliseconds during peak traffic.\n● Introduced feed-versioned Redis keys and update-triggered invalidation, reducing confirmed stale-cache incidents\nfrom 12 to 4 monthly and improving prescription-price consistency.\n● Built React and TypeScript forms with accessible HTML5/CSS3 , preserving medication and pharmacy selections\nwhen consumers corrected inputs or retried failed searches.\n● Built Docker images through Azure DevOps CI/CD and deployed to Azure App Service , reducing routine deployment\nwindows from 45 to 15 minutes.\n● Upgraded Soreli from .NET 6 to .NET 8 with xUnit/Moq API tests and Playwright journey checks, preserving partner\ncontracts and consumer search behavior.\n● Defined versioned REST APIs with OpenAPI/Swagger , translating product and QA requirements into consistent\nvalidation responses, documented partner contracts, and release acceptance criteria.\n● Built Nivaro (Partner-feed validation and offer publication), event-driven C# microservices that validated Amazon S3\npartner feeds in PostgreSQL before publishing approved offer versions to Soreli’s SQL Server catalog.\n● Made Azure Service Bus processing idempotent using unique import keys and transactional SQL Server writes,\nreducing duplicate-publication incidents from eight to one monthly .\n● Combined Python feed-profiling scripts, PostgreSQL validation queries, and Angular exception screens, reducing\nanalyst correction time from 90 to 30 minutes per rejected feed.\n● Integrated Entra ID , OpenID Connect , and OAuth 2.0 into Angular administration, validating JWTs in ASP.NET Core\nAPIs and enforcing separate analyst and supervisor permissions.\n● Deployed Docker workers to Azure Kubernetes Service (AKS) using GitHub Actions and Terraform , scaling ingestion\nindependently and retrieving partner credentials from Azure Key Vault .\n\n● Correlated ingestion and publication traces with OpenTelemetry and Application Insights , reducing average partner-\nfeed investigation time from 70 to 25 minutes.\n● Mentored engineers through SOLID -focused reviews and Agile/Scrum delivery, validating GitHub Copilot and Claude\nCode contributions against pricing rules, automated tests, and OWASP guidance.\nL3 Technologies Jan 2017 – Sep 2023\nSenior Software Engineer\n● Built Tervan (Equipment maintenance and work-order management), an ASP.NET MVC and .NET Framework\napplication hosted on Amazon EC2 , helping maintenance planners assign repairs, reserve parts, and approve work\norders.\n● Implemented SQL Server transactions and Entity Framework row-version checks on Amazon RDS , preventing\nconcurrent planner edits from silently overwriting work-order status or parts reservations.\n● Reworked WPF/XAML technician forms with MVVM and asynchronous lookups, reducing average work-order entry\ntime from nine to six minutes.\n● Created SSRS readiness reports using optimized T-SQL stored procedures, reducing weekly maintenance-planning\npreparation from 6 hours to 2.\n● Integrated Active Directory authentication and role-based permissions, separating technician updates from\nsupervisor approvals and protecting maintenance records used during operational reviews.\n● Developed Orvex (Purchasing integration and parts reconciliation), an ASP.NET Core and Angular reconciliation\napplication that compared maintenance parts requests with Oracle purchasing records and highlighted missing or\nmismatched deliveries.\n● Wrapped SOAP/WCF purchasing integrations with REST adapters, transforming XML responses into JSON records\nwith consistent part identifiers and order statuses for planners.\n● Implemented SSIS reconciliation jobs for purchasing extracts stored in Amazon S3 , reducing average discrepancy\nresolution from two business days to four hours.\n● Automated IIS deployments on Amazon EC2 using AWS CodePipeline , AWS CodeDeploy , and PowerShell , reducing\nscheduled release windows from 90 to 30 minutes.\n● Migrated integration modules to .NET 6 using NUnit/Moq contract tests, then monitored releases with Amazon\nCloudWatch to detect purchasing-integration failures.\nEDUCATION\nThe University of Kansas, Bachelor of Science at Computer Science",
    "salaryFloor": 120000,
    "school": "The University of Kansas",
    "state": "FL",
    "tailoringMode": "base",
    "targetStack": "Full Stack C# / .NET / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "8+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "33196"
  },
  {
    "address": "11607 Curate Wind Ct",
    "archived": false,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Mathematics and Computer Science",
      "schoolsAttended": "Baylor University"
    },
    "city": "Richmond",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 130000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "m@nrbts0328@*",
    "degree": "Bachelor of Science in Mathematics and Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 130000,
    "dob": "11/03/1993",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "mathbrbts@gmail.com"
    ],
    "firstName": "Matthew",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Matthew Roberts",
    "github": "",
    "graduationDate": "May 1, 2016",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1793349826667",
    "languagesFrameworks": {
      "comfortableLanguages": ", ",
      "preferredBackend": "",
      "preferredDatabase": "",
      "preferredFrontend": "",
      "skills": []
    },
    "lastName": "Roberts",
    "linkedin": "linkedin.com/in/matt-roberts-25998588/",
    "location": {
      "country": "United States",
      "resideState": "TX",
      "willingToRelocate": "No"
    },
    "phone": "713 978 0329",
    "preferredName": "Matthew Roberts",
    "primaryEmail": "mathbrbts@gmail.com",
    "primaryStackKeywords": [],
    "requiresSponsorship": "No",
    "resumeText": "",
    "salaryFloor": 120000,
    "school": "Baylor University",
    "state": "TX",
    "tailoringMode": "tailored",
    "targetStack": "Full Stack C# / .NET / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "8+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "77407"
  },
  {
    "address": "15070 SW 119th Ln",
    "archived": false,
    "backgroundAndEducation": {
      "degreeLevel": "Bachelor's Degree",
      "education": "Bachelor of Science in Computer Science",
      "schoolsAttended": "University of Houston"
    },
    "city": "Miami",
    "compensation": {
      "availabilityStart": "Immediate",
      "desiredSalary": 140000,
      "salaryFloor": 120000
    },
    "country": "United States",
    "credentials": {
      "securityClearance": "No"
    },
    "customFields": [],
    "defaultHiringPassword": "@amon=17#55R",
    "degree": "Bachelor of Science in Computer Science",
    "degreeLevel": "Bachelor's Degree",
    "desiredSalary": 140000,
    "dob": "04/01/1997",
    "eeoc": {
      "disability": "No, I do not have a disability and have not had one in the past",
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran"
    },
    "emailAliases": [
      "ramiramon245@gmail.com"
    ],
    "firstName": "Ramon",
    "formerEmployment": {
      "affiliatedCompany": "No",
      "currentEmployee": "No",
      "previousEmployee": "No",
      "workedForCompanyBefore": "No"
    },
    "fullName": "Ramon Ramirez",
    "github": "",
    "graduationDate": "May 1, 2018",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "id": "candidate_1793350512424",
    "languagesFrameworks": {
      "comfortableLanguages": "Python, FastAPI, Django, Flask, Celery, SQLAlchemy, RESTful APIs, pytest, Distributed Systems, Asynchronous Messaging, Unit Testing & Mocking (TDD), React, TypeScript, JavaScript, Angular, HTML5 / CSS3, Responsive Web Design",
      "preferredBackend": "Python, FastAPI, Django, Flask, Celery, SQLAlchemy, RESTful APIs, pytest, Distributed Systems, Asynchronous Messaging, Unit Testing & Mocking (TDD)",
      "preferredDatabase": "PostgreSQL, Redis, Amazon SNS / SQS, Microsoft Azure, AWS, Amazon S3, Docker, GitHub Actions, Git, Containerization, CI/CD, Continuous Integration & Automated Deployment, Cloud Architecture, Relational Databases, Database Design & Optimization, Event-Driven Architecture, In-Memory Caching",
      "preferredFrontend": "React, TypeScript, JavaScript, Angular, HTML5 / CSS3, Responsive Web Design",
      "skills": [
        "python",
        "fastapi",
        "django",
        "flask",
        "celery",
        "sqlalchemy",
        "restful apis",
        "pytest",
        "distributed systems",
        "asynchronous messaging",
        "unit testing   mocking  tdd",
        "react",
        "typescript",
        "javascript",
        "angular",
        "html5   css3",
        "responsive web design",
        "postgresql",
        "redis",
        "amazon sns   sqs",
        "microsoft azure",
        "aws",
        "amazon s3",
        "docker",
        "github actions",
        "git",
        "containerization",
        "ci cd",
        "continuous integration   automated deployment",
        "cloud architecture",
        "relational databases",
        "database design   optimization",
        "event driven architecture",
        "in memory caching",
        "django rest framework",
        "rest apis",
        "pandas",
        "numpy",
        "scipy",
        "scikit learn",
        "sql",
        "aws sqs",
        "azure",
        "linux",
        "cursor",
        "playwright",
        "postman"
      ]
    },
    "lastName": "Ramirez",
    "linkedin": "https://www.linkedin.com/in/ramonrami",
    "location": {
      "country": "United States",
      "resideState": "Florida",
      "willingToRelocate": "No"
    },
    "phone": "7866778838",
    "preferredName": "Ramon Ramirez",
    "primaryEmail": "ramiramon245@gmail.com",
    "primaryStackKeywords": [
      "python",
      "fastapi",
      "django",
      "flask",
      "celery",
      "sqlalchemy",
      "restful apis",
      "pytest",
      "distributed systems",
      "asynchronous messaging",
      "unit testing   mocking  tdd",
      "react",
      "typescript",
      "javascript",
      "angular",
      "html5   css3",
      "responsive web design",
      "postgresql",
      "redis",
      "amazon sns   sqs",
      "microsoft azure",
      "aws",
      "amazon s3",
      "docker",
      "github actions",
      "git",
      "containerization",
      "ci cd",
      "continuous integration   automated deployment",
      "cloud architecture",
      "relational databases",
      "database design   optimization",
      "event driven architecture",
      "in memory caching",
      "django rest framework",
      "rest apis",
      "pandas",
      "numpy",
      "scipy",
      "scikit learn",
      "sql",
      "aws sqs",
      "azure",
      "linux",
      "cursor",
      "playwright",
      "postman"
    ],
    "requiresSponsorship": "No",
    "resumeText": "",
    "salaryFloor": 120000,
    "school": "University of Houston",
    "state": "Florida",
    "tailoringMode": "tailored",
    "targetStack": "Full Stack Python / AI / Cloud",
    "technicalExperience": {
      "softwareEngineeringYears": "10+ years"
    },
    "workAuth": {
      "authorizedInUS": "Yes",
      "requiresSponsorship": "No",
      "workAuthType": "US Citizen"
    },
    "workAuthStatus": "US Citizen",
    "zip": "33196"
  },
  {
    "id": "candidate_1793351015076",
    "archived": false,
    "tailoringMode": "tailored",
    "fullName": "Jack Montgomery",
    "firstName": "Jack",
    "lastName": "Montgomery",
    "preferredName": "Jack Montgomery",
    "defaultHiringPassword": "J@sonk0328@*",
    "dob": "10/13/1991",
    "graduationDate": "May 1, 2016",
    "primaryEmail": "jackomontguru@gmail.com",
    "emailAliases": [
      "jackomontguru@gmail.com"
    ],
    "phone": "7863968297",
    "address": "14152 SW 154th Ct",
    "city": "Miami",
    "state": "FL",
    "zip": "33196",
    "country": "United States",
    "linkedin": "https://www.linkedin.com/in/jackson-m-75428664",
    "github": "",
    "targetStack": "Full Stack Python",
    "salaryFloor": 100000,
    "desiredSalary": 140000,
    "primaryStackKeywords": [],
    "resumeText": "",
    "degreeLevel": "Bachelor's Degree",
    "school": "The University of Kansas",
    "degree": "Bachelor of Science in Computer Science",
    "howHeard": {
      "howHeard": "LinkedIn",
      "referred": "No"
    },
    "workAuthStatus": "US Citizen",
    "requiresSponsorship": "No",
    "workAuth": {
      "authorizedInUS": "Yes",
      "workAuthType": "US Citizen",
      "requiresSponsorship": "No"
    },
    "compensation": {
      "salaryFloor": 100000,
      "desiredSalary": 140000,
      "availabilityStart": "Immediate"
    },
    "location": {
      "resideState": "FL",
      "country": "United States",
      "willingToRelocate": "No"
    },
    "formerEmployment": {
      "workedForCompanyBefore": "No",
      "previousEmployee": "No",
      "currentEmployee": "No",
      "affiliatedCompany": "No"
    },
    "eeoc": {
      "gender": "Male",
      "raceEthnicity": "Two or More Races",
      "veteranStatus": "I am not a protected veteran",
      "disability": "No, I do not have a disability and have not had one in the past"
    },
    "credentials": {
      "securityClearance": "No"
    },
    "backgroundAndEducation": {
      "schoolsAttended": "The University of Kansas",
      "education": "Bachelor of Science in Computer Science",
      "degreeLevel": "Bachelor's Degree"
    },
    "languagesFrameworks": {
      "preferredBackend": "",
      "preferredFrontend": "",
      "preferredDatabase": "",
      "comfortableLanguages": ", ",
      "skills": []
    },
    "technicalExperience": {
      "softwareEngineeringYears": "8+ years"
    },
    "customFields": []
  }
];

// Default Multi-Webhook Configuration
const DEFAULT_WEBHOOKS = [
  {
    "id": "wh_primary",
    "name": "Primary Backend Webhook",
    "url": "http://localhost:3000/api/submissions/log",
    "apiKey": "",
    "isActive": true,
    "sendLiveEvents": true
  },
  {
    "id": "wh_applyflow",
    "name": "Apply-Flow Dashboard & Webhook",
    "url": "http://localhost:5000/api/submissions/webhook",
    "apiKey": "",
    "isActive": true,
    "sendLiveEvents": false
  }
];

// Default Settings
const DEFAULT_SETTINGS = {
  "applierId": "Applier-Primary",
  "activeProfileId": "cmu5hal2f0004lgkehbcfrvmz",
  "activeStackKey": "dotnet",
  "isProfileLocked": false,
  "adminPasskey": "1234567890",
  "interceptionMode": "active",
  "allowOverride": true,
  "minScreeningLength": 15,
  "backendWebhookUrl": "http://localhost:3000/api/submissions/log",
  "backendApiKey": "",
  "mockBackendSuccess": true,
  "streamLiveEvents": true,
  "autoDuplicateWindowDays": 14,
  "autoDetectJobContext": true,
  "autoAutofillOnPageLoad": true,
  "detectCaptchaAndAlert": true,
  "autoFillDemographics": true,
  "autoFillCompensation": true,
  "autoFillCustomQuestions": true,
  "webhooks": [
    {
      "id": "wh_primary",
      "name": "Primary Backend Webhook",
      "url": "http://localhost:3000/api/submissions/log",
      "apiKey": "",
      "isActive": true,
      "sendLiveEvents": true
    },
    {
      "id": "wh_applyflow",
      "name": "Apply-Flow Dashboard & Webhook",
      "url": "http://localhost:5000/api/submissions/webhook",
      "apiKey": "",
      "isActive": true,
      "sendLiveEvents": false
    }
  ]
};

// Helper: Sync default profiles into existing storage and prune removed profiles
function syncProfilesWithDefaults(existingProfiles = []) {
  const defaultIds = new Set(DEFAULT_PROFILES.map(p => p.id));
  // Filter out removed legacy candidates (e.g. candidate-1, candidate-3)
  const filtered = existingProfiles.filter(p => defaultIds.has(p.id) || !["candidate-1", "candidate-3"].includes(p.id));
  
  const result = [...filtered];
  DEFAULT_PROFILES.forEach(defProf => {
    const idx = result.findIndex(p => p.id === defProf.id);
    if (idx >= 0) {
      result[idx] = {
        ...defProf,
        ...result[idx],
        fullName: defProf.fullName,
        preferredName: defProf.preferredName,
        targetStack: defProf.targetStack,
        primaryStackKeywords: defProf.primaryStackKeywords,
        languagesFrameworks: defProf.languagesFrameworks,
        technicalExperience: defProf.technicalExperience,
        architectureScalability: defProf.architectureScalability,
        backgroundAndEducation: defProf.backgroundAndEducation
      };
    } else {
      result.push(defProf);
    }
  });
  return result;
}

// Initialize Storage on install / update
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Submission Checker] Extension installed/updated.");
  
  const existing = await chrome.storage.local.get(["profiles", "settings", "submissionsHistory", "duplicateCache"]);
  
  if (!existing.profiles || existing.profiles.length === 0) {
    await chrome.storage.local.set({ profiles: DEFAULT_PROFILES });
  } else {
    const synced = syncProfilesWithDefaults(existing.profiles);
    await chrome.storage.local.set({ profiles: synced });
  }
  
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    const mergedSettings = { ...DEFAULT_SETTINGS, ...existing.settings };
    if (!mergedSettings.webhooks || mergedSettings.webhooks.length === 0) {
      mergedSettings.webhooks = DEFAULT_WEBHOOKS;
    }
    // Update activeProfileId if it pointed to a deleted candidate
    if (["candidate-1", "candidate-3"].includes(mergedSettings.activeProfileId)) {
      mergedSettings.activeProfileId = "cmu5hal2f0004lgkehbcfrvmz";
    }
    await chrome.storage.local.set({ settings: mergedSettings });
  }

  if (!existing.submissionsHistory) {
    await chrome.storage.local.set({ submissionsHistory: [] });
  }

  if (!existing.duplicateCache) {
    await chrome.storage.local.set({ duplicateCache: {} });
  }
});

// In-Memory Tab-Isolated Sessions Map (tabId -> SessionData)
const tabApplyFlowSessions = new Map();

// Clean up tab tracking when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabApplyFlowSessions.delete(tabId);
});

// Message Bus Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    const actionType = message.action || message.type;
    switch (actionType) {
      case "APPLYFLOW_WEBHOOK": {
        const stored = await chrome.storage.local.get(["applyflow_api_url", "manual_api_url"]);
        const rawServer = message.serverUrl || message.payload?.serverUrl || stored.applyflow_api_url || stored.manual_api_url || "http://localhost:5000";
        const cleanBase = String(rawServer).replace(/\/$/, "");
        const endpoint = cleanBase.endsWith("/api/submissions/webhook") ? cleanBase : `${cleanBase}/api/submissions/webhook`;

        // Ensure payload has screenshot data URLs in all expected property formats
        const payloadToSend = { ...(message.payload || {}) };
        const shots = Array.isArray(payloadToSend.screenshots) ? payloadToSend.screenshots : [];
        if (shots.length > 0) {
          const finalShot = shots[shots.length - 1];
          const finalImg = finalShot?.data_url || finalShot?.image_url || finalShot?.url || finalShot?.base64 || "";
          if (!payloadToSend.screenshot && finalImg) payloadToSend.screenshot = finalImg;
          if (!payloadToSend.screenshot_url && finalImg) payloadToSend.screenshot_url = finalImg;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 9000);
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadToSend),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          const data = await res.json().catch(() => ({}));

          // Also update local duplicate cache so subsequent queries and reloads immediately match
          try {
            const candId = payloadToSend.profile_id || payloadToSend.candidate_id || 'default';
            const { duplicateCache = {}, appliedJobs = {} } = await chrome.storage.local.get(["duplicateCache", "appliedJobs"]);
            const candidateDuplicates = duplicateCache[candId] || [];
            const subJobUrl = payloadToSend.extracted_data?.job_url || payloadToSend.job_url || "";
            const subNormUrl = subJobUrl ? subJobUrl.split('?')[0].split('#')[0].toLowerCase().replace(/\/(confirmation|confirm|thank-you|thanks|submitted|success|step\d+|form|review|apply)\b.*$/i, '').replace(/\/[a-z]{2}(?:-[a-zA-Z]{2})?\//i, '/').replace(/\/$/, '') : "";
            const subSlug = subJobUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];

            const rec = {
              jobId: payloadToSend.job_id || payloadToSend.extracted_data?.job_id || "",
              reqId: payloadToSend.extracted_data?.req_id || "",
              company: payloadToSend.extracted_data?.company || "",
              jobTitle: payloadToSend.extracted_data?.job_title || "",
              jobUrl: subJobUrl,
              appliedAt: new Date().toISOString(),
              timestamp: Date.now(),
              status: payloadToSend.job_status || "APPLIED",
              profile_assigned: payloadToSend.profile_name || "",
              applier_id: payloadToSend.applier_id || ""
            };
            candidateDuplicates.push(rec);
            duplicateCache[candId] = candidateDuplicates;

            // Persistent index for instant reload matching
            if (subNormUrl) appliedJobs[subNormUrl] = rec;
            if (subSlug) appliedJobs[subSlug.toLowerCase()] = rec;
            if (rec.jobId) appliedJobs[rec.jobId] = rec;

            await chrome.storage.local.set({ duplicateCache, appliedJobs });
          } catch (_) {}

          return { success: res.ok, status: res.status, data, endpoint };
        } catch (err) {
          console.warn("[SQC Service Worker] APPLYFLOW_WEBHOOK fetch error:", err.message);
          return { success: false, error: err.message, endpoint };
        }
      }

      case "GET_CONFIG": {
        const data = await chrome.storage.local.get(["profiles", "settings", "latestApplyFlowSession", "appliedJobs"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        if (!settings.webhooks || settings.webhooks.length === 0) {
          settings.webhooks = DEFAULT_WEBHOOKS;
        }
        let profiles = data.profiles || [];
        if (!profiles || profiles.length === 0) {
          profiles = DEFAULT_PROFILES;
          await chrome.storage.local.set({ profiles: DEFAULT_PROFILES });
        }
        const activeProfile = profiles.find(p => p.id === settings.activeProfileId && !p.archived) || profiles.find(p => p.id === settings.activeProfileId) || profiles.find(p => !p.archived) || profiles[0] || null;
        
        // Check active session for this tab or opener tab, fallback to latest global session
        let activeSession = null;
        const tabId = sender.tab?.id;
        const openerTabId = sender.tab?.openerTabId;
        const tabUrl = (sender.tab?.url || '').toLowerCase();

        // Never associate Apply-Flow sessions with non-job services like ChatGPT or search engines
        const isNonJobSite = /^(https?:\/\/)?([a-z0-9-]+\.)*(chatgpt\.com|openai\.com|google\.com|youtube\.com|github\.com|reddit\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|wikipedia\.org)/i.test(tabUrl);
        const hasJobParams = /[?&#](job_id|sqc_job_id|portal_job_id|jobId)=/i.test(tabUrl);

        // Helper: Validate whether an in-memory session actually belongs to this tab's current URL
        function isSessionCompatibleWithUrl(session, targetUrl) {
          if (!session || !targetUrl) return false;
          const targetLower = targetUrl.toLowerCase();
          
          // 1. If targetUrl explicitly contains the session's jobId in hash/query, it's 100% compatible
          if (session.jobId && targetLower.includes(session.jobId.toLowerCase())) return true;

          // 2. If targetUrl explicitly contains a different job_id / sqc_job_id, they do NOT match!
          const targetJobMatch = targetLower.match(/[?&#](?:job_id|sqc_job_id|portal_job_id|jobId)=([^&#]+)/i);
          if (targetJobMatch && targetJobMatch[1] && session.jobId) {
            if (decodeURIComponent(targetJobMatch[1]).trim().toLowerCase() !== session.jobId.trim().toLowerCase()) {
              return false;
            }
          }

          // 3. Check hostname / origin compatibility
          const sessionUrl = (session.sourceUrl || session.jobUrl || session.canonicalPath || '').toLowerCase();
          if (!sessionUrl) return false;

          try {
            const sHost = new URL(sessionUrl).hostname.replace(/^www\./, '');
            const tHost = new URL(targetUrl).hostname.replace(/^www\./, '');

            // Same host
            if (sHost === tHost) {
              const sPath = new URL(sessionUrl).pathname.toLowerCase();
              const tPath = new URL(targetUrl).pathname.toLowerCase();
              const sParts = sPath.split('/').filter(Boolean);
              const tParts = tPath.split('/').filter(Boolean);
              if (sParts.length > 0 && tParts.length > 0) {
                if (sParts[0] !== tParts[0] && !/^(?:jobs|job|careers|en-gb|en-us|view|apply)$/i.test(sParts[0])) {
                  return false;
                }
              }
              return true;
            }

            // Different hosts: Only allow if redirect occurred recently within 15 seconds
            const elapsed = Date.now() - (session.savedAt || 0);
            if (elapsed < 15000 && session.isRedirecting) {
              return true;
            }

            return false;
          } catch (_) {
            return false;
          }
        }

        if (!isNonJobSite || hasJobParams) {
          let candidate = null;
          if (tabId && tabApplyFlowSessions.has(tabId)) {
            candidate = tabApplyFlowSessions.get(tabId);
          } else if (openerTabId && tabApplyFlowSessions.has(openerTabId)) {
            candidate = tabApplyFlowSessions.get(openerTabId);
          } else if (hasJobParams && data.latestApplyFlowSession && (Date.now() - (data.latestApplyFlowSession.savedAt || 0) < 2 * 60 * 60 * 1000)) {
            // Only attach global session if tab explicitly has job parameters!
            candidate = data.latestApplyFlowSession;
          }

          if (candidate && isSessionCompatibleWithUrl(candidate, tabUrl)) {
            activeSession = candidate;
            if (tabId) tabApplyFlowSessions.set(tabId, activeSession);
          } else if (tabId && candidate) {
            // Stale/incompatible session from a previous job in this tab — purge!
            tabApplyFlowSessions.delete(tabId);
          }
        }

        return {
          success: true,
          profiles,
          settings,
          activeProfile,
          activeStackKey: settings.activeStackKey || activeProfile?.activeStackKey || 'dotnet',
          persistedSession: activeSession,
          appliedJobs: data.appliedJobs || {}
        };
      }

      case "PERSIST_REDIRECT_TRACKING": {
        const { data: sessionData } = message;
        if (sessionData && (sessionData.jobId || sessionData.profileId || sessionData.reqId || sessionData.jobTitle)) {
          const tabId = sender.tab?.id;
          const prevSession = (tabId && tabApplyFlowSessions.has(tabId)) ? tabApplyFlowSessions.get(tabId) : {};
          
          // Never let an external ATS UUID overwrite a genuine ApplyFlow CUID
          const isApplyFlowCuid = (id) => /^c[a-z0-9]{20,30}$/i.test(String(id || '').trim());
          const incomingIsCuid = isApplyFlowCuid(sessionData.jobId);
          const prevIsCuid = isApplyFlowCuid(prevSession.jobId);

          const isNewJob = Boolean(
            (incomingIsCuid && prevIsCuid && sessionData.jobId !== prevSession.jobId) ||
            (!sessionData.jobId && sessionData.reqId && prevSession.reqId && sessionData.reqId !== prevSession.reqId)
          );
          const base = isNewJob ? {} : prevSession;

          const validTitle = (t) => t && t !== 'Application Role';
          const validCompany = (c) => c && c !== 'Employer';

          // Preserve authentic CUID if incoming is an external ATS slug
          const resolvedJobId = incomingIsCuid
            ? sessionData.jobId
            : (prevIsCuid ? prevSession.jobId : (sessionData.jobId || base.jobId || ''));

          const sessionToSave = {
            ...base,
            ...sessionData,
            jobId: resolvedJobId,
            profileId: sessionData.profileId || base.profileId || '',
            profileName: sessionData.profileName || base.profileName || '',
            applierId: sessionData.applierId || base.applierId || '',
            jobTitle: validTitle(sessionData.jobTitle) ? sessionData.jobTitle : (base.jobTitle || sessionData.jobTitle || ''),
            company: validCompany(sessionData.company) ? sessionData.company : (base.company || sessionData.company || ''),
            reqId: sessionData.reqId || base.reqId || '',
            jdSalary: sessionData.jdSalary?.has_jd_salary ? sessionData.jdSalary : (base.jdSalary || sessionData.jdSalary || null),
            jdText: sessionData.jdText || base.jdText || '',
            savedFormState: sessionData.savedFormState || base.savedFormState || null,
            screenshots: Array.isArray(sessionData.screenshots) ? sessionData.screenshots : (base.screenshots || []),
            sourceUrl: base.sourceUrl || sessionData.sourceUrl || '',
            savedAt: Date.now()
          };
          if (tabId) {
            tabApplyFlowSessions.set(tabId, sessionToSave);
          }
          if (sessionToSave.jobId || sessionToSave.profileId) {
            const { screenshots: _omitShots, ...lightSession } = sessionToSave;
            await chrome.storage.local.set({ latestApplyFlowSession: lightSession });
          }
          return { success: true, session: sessionToSave };
        }
        return { success: false, error: "Invalid session tracking data" };
      }

      case "CAPTURE_PAGE_SCREENSHOT": {
        const meta = message.meta || message;
        const tabId = sender.tab?.id;
        const windowId = sender.tab?.windowId;
        let rawDataUrl = meta.preCapturedDataUrl || message.preCapturedDataUrl || '';

        if (windowId !== undefined) {
          try {
            const captured = await chrome.tabs.captureVisibleTab(windowId, {
              format: "jpeg",
              quality: 68
            });
            if (captured) {
              rawDataUrl = captured;
            }
          } catch (capErr) {
            console.warn("[SQC Service Worker] captureVisibleTab notice:", capErr.message);
          }
        }

        if (!rawDataUrl) {
          rawDataUrl = meta.preCapturedDataUrl || message.preCapturedDataUrl || '';
        }

        if (!rawDataUrl) {
          return { success: false, error: "No screenshot image captured" };
        }

        const prevSession = (tabId && tabApplyFlowSessions.has(tabId)) ? tabApplyFlowSessions.get(tabId) : {};
        const incomingJobId = meta.job_id || meta.jobId || message.jobId || '';
        const incomingReqId = meta.req_id || meta.reqId || message.reqId || '';
        const isNewJob = Boolean(
          (incomingJobId && prevSession.jobId && incomingJobId !== prevSession.jobId) ||
          (!incomingJobId && incomingReqId && prevSession.reqId && incomingReqId !== prevSession.reqId)
        );
        const existingShots = isNewJob ? [] : (Array.isArray(prevSession.screenshots) ? [...prevSession.screenshots] : []);

        const stepLabel = meta.step_label || meta.stepLabel || message.stepLabel || "Application Form";
        const trigger = meta.trigger || message.trigger || "AUTO_CAPTURE";
        const pageUrl = meta.page_url || meta.pageUrl || message.pageUrl || sender.tab?.url || "";
        const scrollBucket = Math.round((Number(meta.scroll_y || message.scrollY) || 0) / 450);
        const answeredCount = Number(meta.answered_count || message.answeredCount) || 0;
        const stepKey = `${pageUrl.split('#')[0]}::${stepLabel}::${scrollBucket}::${trigger}`;

        const shotId = `shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const shotItem = {
          id: shotId,
          step_key: stepKey,
          step_label: stepLabel,
          trigger,
          page_url: pageUrl,
          job_id: incomingJobId || prevSession.jobId || "",
          req_id: incomingReqId || prevSession.reqId || "",
          answered_count: answeredCount,
          total_fields_count: Number(meta.total_fields_count || message.totalFieldsCount) || 0,
          scroll_y: Number(meta.scroll_y || message.scrollY) || 0,
          captured_at: new Date().toISOString(),
          data_url: rawDataUrl,
          image_url: rawDataUrl,
          url: rawDataUrl,
          base64: rawDataUrl,
          image: rawDataUrl,
          screenshot: rawDataUrl
        };

        // Deduplicate by stepKey unless manual snap or final submit
        const existingIdx = existingShots.findIndex(s => s.step_key === stepKey);
        if (existingIdx >= 0 && trigger !== "MANUAL_SNAP" && trigger !== "FINAL_SUBMIT") {
          existingShots[existingIdx] = shotItem;
        } else {
          existingShots.push(shotItem);
        }

        // Keep up to 8 most relevant screenshots per job application
        const trimmedShots = existingShots.slice(-8);

        if (tabId) {
          tabApplyFlowSessions.set(tabId, {
            ...prevSession,
            jobId: incomingJobId || prevSession.jobId || "",
            reqId: incomingReqId || prevSession.reqId || "",
            screenshots: trimmedShots,
            savedAt: Date.now()
          });
        }

        return {
          success: true,
          screenshot: shotItem,
          screenshots: trimmedShots
        };
      }

      case "GET_SESSION_SCREENSHOTS": {
        const tabId = sender.tab?.id;
        const sess = (tabId && tabApplyFlowSessions.has(tabId)) ? tabApplyFlowSessions.get(tabId) : {};
        return {
          success: true,
          screenshots: Array.isArray(sess.screenshots) ? sess.screenshots : []
        };
      }

      case "DELETE_SESSION_SCREENSHOT": {
        const tabId = sender.tab?.id;
        const shotId = message.screenshotId;
        if (tabId && tabApplyFlowSessions.has(tabId)) {
          const sess = tabApplyFlowSessions.get(tabId);
          sess.screenshots = (sess.screenshots || []).filter(s => s.id !== shotId);
          tabApplyFlowSessions.set(tabId, sess);
          return { success: true, screenshots: sess.screenshots };
        }
        return { success: true, screenshots: [] };
      }

      case "CLEAR_SESSION_SCREENSHOTS": {
        const tabId = sender.tab?.id;
        if (tabId && tabApplyFlowSessions.has(tabId)) {
          const sess = tabApplyFlowSessions.get(tabId);
          sess.screenshots = [];
          tabApplyFlowSessions.set(tabId, sess);
        }
        return { success: true, screenshots: [] };
      }

      case "SAVE_PROFILE": {
        const { profile } = message;
        if (!profile || !profile.id) return { success: false, error: "Invalid profile data" };

        const data = await chrome.storage.local.get(["profiles", "settings"]);
        let profiles = data.profiles || [];
        if (!profiles || profiles.length === 0) {
          profiles = DEFAULT_PROFILES;
          await chrome.storage.local.set({ profiles: DEFAULT_PROFILES });
        }
        const existingIdx = profiles.findIndex(p => p.id === profile.id);

        if (existingIdx >= 0) {
          // Deep merge with existing fields so nested objects and custom fields are preserved
          profiles[existingIdx] = {
            ...profiles[existingIdx],
            ...profile,
            archived: typeof profile.archived === 'boolean' ? profile.archived : (profiles[existingIdx].archived || false),
            workAuth: { ...(profiles[existingIdx].workAuth || {}), ...(profile.workAuth || {}) },
            compensation: { ...(profiles[existingIdx].compensation || {}), ...(profile.compensation || {}) },
            eeoc: { ...(profiles[existingIdx].eeoc || {}), ...(profile.eeoc || {}) },
            location: { ...(profiles[existingIdx].location || {}), ...(profile.location || {}) },
            technicalExperience: { ...(profiles[existingIdx].technicalExperience || {}), ...(profile.technicalExperience || {}) },
            customFields: profile.customFields || profiles[existingIdx].customFields || []
          };
        } else {
          profile.archived = !!profile.archived;
          profiles.push(profile);
        }

        await chrome.storage.local.set({ profiles });
        notifyTabsAboutStateChange();
        return { success: true, profiles, savedProfile: profiles[existingIdx >= 0 ? existingIdx : profiles.length - 1] };
      }

      case "TOGGLE_ARCHIVE_PROFILE":
      case "ARCHIVE_PROFILE": {
        const { profileId, archived } = message;
        if (!profileId) return { success: false, error: "Missing profileId" };

        const data = await chrome.storage.local.get(["profiles", "settings"]);
        let profiles = data.profiles || [];
        if (!profiles || profiles.length === 0) {
          profiles = DEFAULT_PROFILES;
          await chrome.storage.local.set({ profiles: DEFAULT_PROFILES });
        }
        const idx = profiles.findIndex(p => p.id === profileId);
        if (idx === -1) return { success: false, error: "Profile not found" };

        const newArchived = (typeof archived === 'boolean') ? archived : !profiles[idx].archived;
        profiles[idx].archived = newArchived;

        const settings = data.settings || DEFAULT_SETTINGS;
        // If we archived the active profile, switch to the first non-archived profile
        if (newArchived && settings.activeProfileId === profileId) {
          const nextActive = profiles.find(p => !p.archived && p.id !== profileId);
          if (nextActive) {
            settings.activeProfileId = nextActive.id;
          }
        }

        await chrome.storage.local.set({ profiles, settings });
        notifyTabsAboutStateChange();
        return { success: true, profiles, settings, isArchived: newArchived };
      }

      case "DELETE_PROFILE": {
        const { profileId } = message;
        if (!profileId) return { success: false, error: "Missing profileId" };

        const data = await chrome.storage.local.get(["profiles", "settings"]);
        let profiles = data.profiles || [];
        profiles = profiles.filter(p => p.id !== profileId);

        const settings = data.settings || DEFAULT_SETTINGS;
        if (settings.activeProfileId === profileId && profiles.length > 0) {
          const nextActive = profiles.find(p => !p.archived) || profiles[0];
          settings.activeProfileId = nextActive.id;
        }

        await chrome.storage.local.set({ profiles, settings });
        notifyTabsAboutStateChange();
        return { success: true, profiles };
      }

      case "SYNC_DEFAULT_PROFILES": {
        const data = await chrome.storage.local.get(["profiles"]);
        const synced = syncProfilesWithDefaults(data.profiles || []);
        await chrome.storage.local.set({ profiles: synced });
        notifyTabsAboutStateChange();
        return { success: true, profiles: synced };
      }

      case "SAVE_SETTINGS": {
        const { settings: newSettings } = message;
        if (!newSettings) return { success: false, error: "Missing settings" };

        const data = await chrome.storage.local.get(["settings"]);
        const merged = { ...(data.settings || DEFAULT_SETTINGS), ...newSettings };
        await chrome.storage.local.set({ settings: merged });
        notifyTabsAboutStateChange();
        return { success: true, settings: merged };
      }

      case "SAVE_WEBHOOKS": {
        const { webhooks } = message;
        if (!Array.isArray(webhooks)) return { success: false, error: "Webhooks must be an array" };

        const data = await chrome.storage.local.get(["settings"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        settings.webhooks = webhooks;
        if (webhooks.length > 0 && webhooks[0].url) {
          settings.backendWebhookUrl = webhooks[0].url;
          settings.backendApiKey = webhooks[0].apiKey || "";
        }

        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return { success: true, settings };
      }

      case "SET_ACTIVE_PROFILE": {
        const data = await chrome.storage.local.get(["settings", "profiles"]);
        const settings = data.settings || DEFAULT_SETTINGS;

        // If profile is locked, require valid admin token
        if (settings.isProfileLocked) {
          const expectedToken = settings.adminPasskey || "1234567890";
          if (!message.adminToken || message.adminToken.trim() !== expectedToken.trim()) {
            return {
              success: false,
              isLocked: true,
              error: "Candidate profile and stack track are locked to user. An Admin Token / Passkey is required to switch profile assignment."
            };
          }
        }

        if (message.profileId) settings.activeProfileId = message.profileId;
        if (message.activeStackKey) settings.activeStackKey = message.activeStackKey;
        await chrome.storage.local.set({ settings });
        
        notifyTabsAboutStateChange();
        return { success: true, settings };
      }

      case "ADMIN_UNLOCK_PROFILE": {
        const data = await chrome.storage.local.get(["settings", "profiles"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        const expectedToken = settings.adminPasskey || "1234567890";

        if (!message.adminToken || message.adminToken.trim() !== expectedToken.trim()) {
          return { success: false, error: "Invalid Admin Token / Passkey. Authorization rejected." };
        }

        if (message.profileId) {
          settings.activeProfileId = message.profileId;
        }
        if (message.activeStackKey) {
          settings.activeStackKey = message.activeStackKey;
        }
        if (typeof message.isProfileLocked === 'boolean') {
          settings.isProfileLocked = message.isProfileLocked;
        }

        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return {
          success: true,
          message: "Profile and stack track reassigned successfully by Admin.",
          settings
        };
      }

      case "ADMIN_TOGGLE_LOCK": {
        const data = await chrome.storage.local.get(["settings"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        const expectedToken = settings.adminPasskey || "1234567890";

        if (!message.adminToken || message.adminToken.trim() !== expectedToken.trim()) {
          return { success: false, error: "Invalid Admin Token. Action rejected." };
        }

        settings.isProfileLocked = !settings.isProfileLocked;
        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return { success: true, isProfileLocked: settings.isProfileLocked, settings };
      }

      case "SET_INTERCEPTION_MODE": {
        const data = await chrome.storage.local.get(["settings"]);
        const settings = data.settings || DEFAULT_SETTINGS;
        settings.interceptionMode = message.mode; // 'active' or 'audit'
        await chrome.storage.local.set({ settings });
        notifyTabsAboutStateChange();
        return { success: true, settings };
      }

      case "CHECK_DUPLICATE": {
        const { candidateId, reqId, company, jobTitle } = message.payload;
        const { duplicateCache = {} } = await chrome.storage.local.get("duplicateCache");
        
        const candidateCache = duplicateCache[candidateId] || [];
        const now = Date.now();
        const windowMs = (message.windowDays || 14) * 24 * 60 * 60 * 1000;

        const matched = candidateCache.find(entry => {
          if (now - entry.timestamp > windowMs) return false;
          // Match by Req ID if present
          if (reqId && entry.reqId && entry.reqId.toLowerCase().trim() === reqId.toLowerCase().trim()) {
            return true;
          }
          // Match by Company + Job Title
          if (company && jobTitle && entry.company && entry.jobTitle) {
            const sameCompany = entry.company.toLowerCase().trim() === company.toLowerCase().trim();
            const sameJob = entry.jobTitle.toLowerCase().trim() === jobTitle.toLowerCase().trim();
            if (sameCompany && sameJob) return true;
          }
          return false;
        });

        return {
          isDuplicate: !!matched,
          duplicateRecord: matched || null
        };
      }

      case "LOG_SUBMISSION": {
        const record = message.payload;
        const timestamp = new Date().toISOString();
        const recordId = "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
        const tabId = sender.tab?.id;
        const tabSession = (tabId && tabApplyFlowSessions.has(tabId)) ? tabApplyFlowSessions.get(tabId) : {};
        const sessionScreenshots = Array.isArray(tabSession.screenshots) ? tabSession.screenshots : [];
        const mergedScreenshots = (Array.isArray(record.screenshots) && record.screenshots.length > 0)
          ? record.screenshots
          : sessionScreenshots;

        const formattedMerged = (mergedScreenshots || []).map((s, idx) => {
          const img = s.data_url || s.dataUrl || s.image_url || s.imageUrl || s.url || s.base64 || s.image || s.screenshot || "";
          return {
            ...s,
            id: s.id || `shot_${idx + 1}_${Date.now()}`,
            data_url: img,
            image_url: img,
            url: img,
            base64: img,
            image: img,
            screenshot: img
          };
        }).filter(s => Boolean(s.data_url));

        const primaryImg = (formattedMerged[formattedMerged.length - 1] || formattedMerged[0])?.data_url || record.screenshot || record.screenshot_url || "";

        const enrichedRecord = {
          id: recordId,
          ...record,
          screenshot: primaryImg,
          screenshot_url: primaryImg,
          screenshots: formattedMerged,
          screenshots_count: formattedMerged.length,
          extracted_data: {
            ...(record.extracted_data || {}),
            screenshots: formattedMerged,
            screenshots_count: formattedMerged.length
          },
          timestamp
        };

        // 1. Save to local submissions history (cap local storage screenshot retention to prevent quota overflow)
        const { submissionsHistory = [], duplicateCache = {}, settings = DEFAULT_SETTINGS } = await chrome.storage.local.get([
          "submissionsHistory",
          "duplicateCache",
          "settings"
        ]);

        const localRecord = {
          ...enrichedRecord,
          screenshots: mergedScreenshots.slice(-4)
        };
        const updatedHistory = [localRecord, ...submissionsHistory.slice(0, 49)]; // Keep latest 50 with screenshots in local extension storage
        
        // Update duplicate cache if submitted successfully
        const candidateId = record.candidate_id || settings.activeProfileId;
        const candidateDuplicates = duplicateCache[candidateId] || [];
        candidateDuplicates.push({
          submissionId: recordId,
          jobId: record.job_id || record.extracted_data?.job_id || "",
          reqId: record.extracted_data?.req_id || "",
          company: record.extracted_data?.company || "",
          jobTitle: record.extracted_data?.job_title || "",
          jobUrl: record.extracted_data?.job_url || "",
          appliedAt: new Date().toISOString(),
          timestamp: Date.now(),
          status: record.validation_status || "APPLIED",
          profile_assigned: record.profile_name || record.profile_assigned || "",
          applier_id: record.applier_id || ""
        });
        duplicateCache[candidateId] = candidateDuplicates;

        await chrome.storage.local.set({
          submissionsHistory: updatedHistory,
          duplicateCache
        });

        // 2. Dispatch to remote backend webhook
        const webhookResult = await dispatchToBackend(enrichedRecord, settings);

        // 3. Show native notification if needed
        if (enrichedRecord.validation_status === "PASSED") {
          chrome.notifications?.create({
            type: "basic",
            iconUrl: "icons/icon48.png",
            title: "Submission Logged Successfully",
            message: `Applied for ${record.extracted_data?.job_title || 'Role'} at ${record.extracted_data?.company || 'Company'} for ${record.profile_assigned}`
          });
        }

        return {
          success: true,
          recordId,
          webhookResult
        };
      }

      case "DISPATCH_LIVE_FEEDBACK": {
        // Called when candidate is typing/pasting into form fields to stream live field snapshot
        const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
        const webhookUrl = settings.backendWebhookUrl || DEFAULT_SETTINGS.backendWebhookUrl;
        const streamEvents = settings.streamLiveEvents !== false;

        const payload = message.payload || {};
        const incomingData = payload.extracted_data || {};

        // If incoming data has no inputs filled, don't dispatch an empty update to overwrite real form data
        const hasValues = Boolean(
          incomingData.candidate_name ||
          incomingData.candidate_first_name ||
          incomingData.email_entered ||
          incomingData.phone_entered ||
          incomingData.salary_expected ||
          incomingData.resume_uploaded ||
          (incomingData.all_entries && incomingData.all_entries.some(e => Boolean(e.value)))
        );

        if (!hasValues) {
          return { success: true };
        }

        if (webhookUrl && streamEvents) {
          try {
            let liveEventUrl;
            try {
              const u = new URL(webhookUrl);
              liveEventUrl = `${u.origin}/api/submissions/live-event`;
            } catch (_) {
              liveEventUrl = webhookUrl.replace(/\/log$/, '') + '/live-event';
            }

            await fetch(liveEventUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
          } catch (e) {
            // Passive stream catch
          }
        }
        return { success: true };
      }

      case "CHECK_DUPLICATE_JOB": {
        const { candidateId, candidateName, jobUrl, company, jobTitle, reqId, jobId, serverUrl } = message;
        const { duplicateCache = {}, appliedJobs = {}, settings = DEFAULT_SETTINGS, applyflow_api_url, manual_api_url } = await chrome.storage.local.get(["duplicateCache", "appliedJobs", "settings", "applyflow_api_url", "manual_api_url"]);

        const cleanUrl = jobUrl ? jobUrl.split('?')[0].split('#')[0].toLowerCase() : '';
        const cleanReq = reqId ? String(reqId).toLowerCase().trim() : '';
        const cleanCompany = (company || '').toLowerCase().trim();
        const cleanTitle = (jobTitle || '').toLowerCase().trim();

        const normalizeAtsUrl = (u) => {
          if (!u) return '';
          return u.split('?')[0].split('#')[0].toLowerCase()
            .replace(/\/(confirmation|confirm|thank-you|thanks|submitted|success|step\d+|form|review|apply)\b.*$/i, '')
            .replace(/\/[a-z]{2}(?:-[a-zA-Z]{2})?\//i, '/')
            .replace(/\/$/, '');
        };
        const normCleanUrl = normalizeAtsUrl(jobUrl);
        const atsSlug = cleanUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() || '';

        // 1. Fast Check: Global persistent appliedJobs index (instant response across reloads)
        const cachedApplied = (normCleanUrl && appliedJobs[normCleanUrl]) ||
                              (atsSlug && appliedJobs[atsSlug]) ||
                              (jobId && appliedJobs[jobId]);
        if (cachedApplied) {
          return {
            success: true,
            already_applied: true,
            has_applied: true,
            can_apply: false,
            reason: "ALREADY_APPLIED",
            message: cachedApplied.message || `Already applied on ${cachedApplied.appliedAt ? new Date(cachedApplied.appliedAt).toLocaleDateString() : 'earlier date'} in Apply-Flow`,
            existingRecord: cachedApplied
          };
        }

        // 1b. Check local extension duplicate cache (across active profile & candidate name match)
        const localList = duplicateCache[candidateId] || [];
        const allDuplicates = Object.values(duplicateCache).flat();
        const candidateDuplicates = candidateName
          ? allDuplicates.filter(d => (d.profile_assigned || '').toLowerCase().trim() === (candidateName || '').toLowerCase().trim())
          : localList;
        const checkList = [...localList, ...candidateDuplicates];

        // Helper: Generic feed/listing pages where URL alone should NEVER indicate a duplicate
        const isGenericFeedUrl = (u) => {
          if (!u) return false;
          return u.includes('/candidate/suggested-jobs') ||
                 u.includes('/jobs-search') ||
                 u.includes('/jobs/search') ||
                 u.includes('/search') ||
                 u.includes('/feed') ||
                 /ziprecruiter\.com\/?$/i.test(u) ||
                 /linkedin\.com\/jobs\/?$/i.test(u) ||
                 /indeed\.com\/?$/i.test(u);
        };
        const isFeed = isGenericFeedUrl(cleanUrl);

        const localMatch = checkList.find(item => {
          const itemUrl = item.jobUrl ? item.jobUrl.split('?')[0].split('#')[0].toLowerCase() : '';
          const normItemUrl = normalizeAtsUrl(item.jobUrl);
          const itemReq = item.reqId ? String(item.reqId).toLowerCase().trim() : '';
          const itemCompany = (item.company || '').toLowerCase().trim();
          const itemTitle = (item.jobTitle || '').toLowerCase().trim();

          // A0. Exact Apply-Flow Job ID match
          if (jobId && item.jobId && String(jobId).trim() === String(item.jobId).trim()) {
            return true;
          }

          // A. Exact requisition ID match
          if (cleanReq && itemReq && cleanReq === itemReq) return true;

          // B. Matching company AND job title
          if (cleanCompany && itemCompany && cleanTitle && itemTitle) {
            const companyMatch = cleanCompany === itemCompany || cleanCompany.includes(itemCompany) || itemCompany.includes(cleanCompany);
            const titleMatch = cleanTitle === itemTitle || cleanTitle.includes(itemTitle) || itemTitle.includes(cleanTitle);
            if (companyMatch && titleMatch) return true;
          }

          // C. Canonical or normalized ATS job URL match
          if (!isFeed && !isGenericFeedUrl(itemUrl)) {
            if (cleanUrl && itemUrl && cleanUrl === itemUrl) return true;
            if (normCleanUrl && normItemUrl && normCleanUrl === normItemUrl && normCleanUrl.length > 15) return true;
            if (atsSlug && itemUrl.includes(atsSlug)) return true;
          }

          return false;
        });

        if (localMatch) {
          return {
            success: true,
            already_applied: true,
            has_applied: true,
            can_apply: false,
            existingRecord: localMatch
          };
        }

        // 2. Query Apply-Flow & Remote Backend Servers via /api/submissions/check-status
        const checkEndpoints = [];
        const rawServer = serverUrl || applyflow_api_url || manual_api_url || settings.backendWebhookUrl || DEFAULT_SETTINGS.backendWebhookUrl;
        
        // Prioritize localhost:5000 directly for maximum speed and to avoid dev-proxy latency
        if (!checkEndpoints.includes("http://localhost:5000/api/submissions/check-status")) {
          checkEndpoints.push("http://localhost:5000/api/submissions/check-status");
        }
        try {
          const u = new URL(rawServer);
          const candidateEp = `${u.origin}/api/submissions/check-status`;
          if (!checkEndpoints.includes(candidateEp)) checkEndpoints.push(candidateEp);
        } catch (_) {
          const candidateEp = `${String(rawServer).replace(/\/$/, '')}/api/submissions/check-status`;
          if (!checkEndpoints.includes(candidateEp)) checkEndpoints.push(candidateEp);
        }

        for (const ep of checkEndpoints) {
          try {
            const checkUrl = new URL(ep);
            if (jobUrl) checkUrl.searchParams.set('url', jobUrl);
            if (candidateId) checkUrl.searchParams.set('profile_id', candidateId);
            if (candidateName) checkUrl.searchParams.set('profile_name', candidateName);
            if (company) checkUrl.searchParams.set('company', company);
            if (jobTitle) checkUrl.searchParams.set('role_title', jobTitle);
            if (reqId || jobId) checkUrl.searchParams.set('job_id', jobId || reqId);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500);

            const res = await fetch(checkUrl.toString(), {
              headers: { "Accept": "application/json" },
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              if (data && (data.has_applied || data.already_applied || data.can_apply === false || data.status === 'APPLIED' || data.jobStatus === 'APPLIED' || data.candidate?.status_for_candidate === 'APPLIED')) {
                const rec = {
                  appliedAt: data.candidate?.applied_at || data.appliedAt || new Date().toISOString(),
                  applier_id: data.candidate?.assigned_applier || data.candidate?.applied_by || data.applier || data.appliedBy || "",
                  profile_assigned: data.candidate?.profile_name || data.candidateName || candidateName || "",
                  candidate: data.candidate,
                  job: data.job,
                  message: data.message
                };

                // Save to persistent appliedJobs in storage so reloads never lose this state
                try {
                  const { appliedJobs: curApplied = {} } = await chrome.storage.local.get("appliedJobs");
                  if (normCleanUrl) curApplied[normCleanUrl] = rec;
                  if (atsSlug) curApplied[atsSlug] = rec;
                  if (data.job?.id) curApplied[data.job.id] = rec;
                  if (jobId) curApplied[jobId] = rec;
                  await chrome.storage.local.set({ appliedJobs: curApplied });
                } catch (_) {}

                return {
                  success: true,
                  already_applied: true,
                  has_applied: true,
                  can_apply: false,
                  reason: data.reason || "ALREADY_APPLIED",
                  message: data.message || "Candidate was already submitted to this job.",
                  job: data.job,
                  candidate: data.candidate,
                  existingRecord: rec
                };
              } else if (data && data.exists_in_system) {
                return {
                  success: true,
                  already_applied: false,
                  has_applied: false,
                  can_apply: true,
                  jobStatus: data.candidate?.status_for_candidate || "PENDING",
                  job: data.job,
                  candidate: data.candidate
                };
              }
            }
          } catch (_) {
            // Server offline or timed out, proceed to next endpoint
          }
        }

        return {
          success: true,
          already_applied: false,
          has_applied: false,
          can_apply: true,
          existingRecord: null
        };
      }

      case "GET_HISTORY": {
        const { submissionsHistory = [] } = await chrome.storage.local.get("submissionsHistory");
        return { success: true, history: submissionsHistory };
      }

      case "CLEAR_HISTORY": {
        await chrome.storage.local.set({ submissionsHistory: [], duplicateCache: {} });
        return { success: true };
      }

      case "TEST_BACKEND_PING": {
        const { url, apiKey } = message;
        if (!url) return { success: false, error: "No URL provided" };
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
              },
              body: JSON.stringify({ ping: true, timestamp: new Date().toISOString() }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok || res.status === 200 || res.status === 201 || res.status === 204) {
              return { success: true, status: res.status, statusText: `Online (HTTP ${res.status} ${res.statusText || 'OK'})` };
            }

            // If endpoint is reachable but returned 400/404/405, the host server is alive
            if (res.status === 400 || res.status === 404 || res.status === 405) {
              return { success: true, status: res.status, statusText: `Server Online (HTTP ${res.status})` };
            }

            return { success: false, status: res.status, error: `HTTP ${res.status}: ${res.statusText || 'Error'}` };
          } catch (postErr) {
            clearTimeout(timeoutId);
            // Fallback: Check if origin server or /api/health is up
            try {
              const origin = new URL(url).origin;
              const hRes = await fetch(`${origin}/api/health`, { method: "GET" });
              if (hRes.ok) {
                return { success: true, status: 200, statusText: `Online on ${origin} (/api/health)` };
              }
            } catch (_) {}

            try {
              const origin = new URL(url).origin;
              const rRes = await fetch(origin, { method: "GET" });
              if (rRes.ok || rRes.status < 500) {
                return { success: true, status: rRes.status, statusText: `Online on ${origin}` };
              }
            } catch (_) {}

            return { success: false, error: postErr.message || 'Endpoint unreachable' };
          }
        } catch (err) {
          return { success: false, error: err.message || 'Endpoint unreachable' };
        }
      }

      case "FETCH_APPLYFLOW_CONTEXT": {
        const { jobId, profileId, profileName, serverUrl, url: jobPageUrl } = message;
        if (!jobId && !profileId && !jobPageUrl) return { success: false, error: "Missing jobId, profileId, or url" };

        const { applyflow_api_url, manual_api_url, settings = DEFAULT_SETTINGS } = await chrome.storage.local.get(["applyflow_api_url", "manual_api_url", "settings"]);
        const targetServer = (serverUrl || applyflow_api_url || manual_api_url || settings.backendWebhookUrl || "http://localhost:5000").replace(/\/$/, "");

        const endpointsToTry = [];
        try {
          const u = new URL(targetServer);
          endpointsToTry.push(`${u.origin}/api/submissions/context`);
        } catch (_) {
          endpointsToTry.push(`${targetServer}/api/submissions/context`);
        }
        if (!endpointsToTry.includes("http://localhost:5000/api/submissions/context")) {
          endpointsToTry.push("http://localhost:5000/api/submissions/context");
        }

        for (const ep of endpointsToTry) {
          try {
            const url = new URL(ep);
            if (jobId) url.searchParams.set("job_id", jobId);
            if (profileId) url.searchParams.set("profile_id", profileId);
            if (profileName) url.searchParams.set("profile_name", profileName);
            if (jobPageUrl) url.searchParams.set("url", jobPageUrl);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500);

            const res = await fetch(url.toString(), {
              method: "GET",
              headers: { "Accept": "application/json" },
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              return { success: true, data: data.data || data };
            }
          } catch (_) {
            // Try next endpoint
          }
        }
        return { success: false, error: "Submission context endpoint unreachable" };
      }

      case "OPEN_OPTIONS": {
        chrome.runtime.openOptionsPage();
        return { success: true };
      }

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  };

  handler()
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true; // Keep message channel open for async response
});

// Helper: Dispatches to all configured active webhook endpoints & Apply-Flow
async function dispatchToBackend(record, settings) {
  const webhooks = (settings.webhooks && settings.webhooks.length > 0)
    ? settings.webhooks.filter(w => w.isActive && w.url)
    : [];

  // Fallback to legacy URL if webhooks array is empty
  if (webhooks.length === 0 && settings.backendWebhookUrl) {
    webhooks.push({
      id: "wh_legacy",
      name: "Primary Webhook",
      url: settings.backendWebhookUrl,
      apiKey: settings.backendApiKey || "",
      isActive: true
    });
  }

  // Dynamic Target Server Routing (Dual compatibility: localhost:5000 & Render)
  let cachedData = {};
  try {
    cachedData = await chrome.storage.local.get(["applyflow_api_url", "manual_api_url"]);
  } catch (_) {}
  const dynamicServerUrl = record.serverUrl || record.sqc_api_url || record.extracted_data?.apply_flow_params?.apiUrl || cachedData.applyflow_api_url || cachedData.manual_api_url || "http://localhost:5000";
  const cleanBase = String(dynamicServerUrl).replace(/\/$/, "");
  const dynamicWebhookUrl = cleanBase.endsWith("/api/submissions/webhook") ? cleanBase : `${cleanBase}/api/submissions/webhook`;

  // Always prepend the dynamic target webhook with top priority
  if (!webhooks.some(w => w.url === dynamicWebhookUrl)) {
    webhooks.unshift({
      id: "wh_dynamic_applyflow",
      name: `Apply-Flow (${cleanBase.includes('render.com') ? 'Render' : 'Localhost'})`,
      url: dynamicWebhookUrl,
      apiKey: "",
      isActive: true
    });
  }

  // Also ensure http://localhost:5000/api/submissions/webhook is included as fallback if dynamic is Render or remote
  const localFallbackUrl = "http://localhost:5000/api/submissions/webhook";
  if (!webhooks.some(w => w.url === localFallbackUrl) && dynamicWebhookUrl !== localFallbackUrl) {
    webhooks.push({
      id: "wh_applyflow_local_fallback",
      name: "Apply-Flow Local Fallback",
      url: localFallbackUrl,
      apiKey: "",
      isActive: true
    });
  }

  const results = await Promise.allSettled(webhooks.map(async (wh) => {
    try {
      const headers = { "Content-Type": "application/json" };
      if (wh.apiKey) {
        headers["Authorization"] = `Bearer ${wh.apiKey}`;
        headers["X-API-Key"] = wh.apiKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const response = await fetch(wh.url, {
        method: "POST",
        headers,
        body: JSON.stringify(record),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));
      return {
        id: wh.id,
        name: wh.name,
        url: wh.url,
        success: response.ok,
        status: response.status,
        data
      };
    } catch (error) {
      console.warn(`[Submission Checker] Webhook error for ${wh.name} (${wh.url}):`, error.message);
      return {
        id: wh.id,
        name: wh.name,
        url: wh.url,
        success: false,
        error: error.message
      };
    }
  }));

  const delivered = results.filter(r => r.status === 'fulfilled' && r.value.success);
  return {
    status: delivered.length > 0 ? "DELIVERED" : (settings.mockBackendSuccess ? "SIMULATED_LOCAL" : "FAILED"),
    totalWebhooks: webhooks.length,
    deliveredCount: delivered.length,
    details: results.map(r => r.value || { error: r.reason })
  };
}

function notifyTabsAboutStateChange() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED" }).catch(() => {
          // Tab might not have content script injected
        });
      }
    });
  });
}
