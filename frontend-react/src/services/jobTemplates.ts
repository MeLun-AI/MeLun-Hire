/* ------------------------------------------------------------------ */
/*  HR job-post templates: role-specific pre-fill for the Post Job flow  */
/*  Templates only fill the existing CreateJobPayload fields; HR can     */
/*  freely edit every field before submitting to POST /hr/job-post.      */
/* ------------------------------------------------------------------ */

export type TemplateFieldKey =
  | 'job_title'
  | 'job_domain'
  | 'job_type'
  | 'job_mode'
  | 'experience_required'
  | 'location'
  | 'description'
  | 'salary'
  | 'deadline'
  | 'required_skills'
  | 'preferred_skills'
  | 'responsibilities'
  | 'company_overview'
  | 'benefits'
  | 'hiring_process'
  | 'recruiter_notes';

export type JobTemplate = Record<TemplateFieldKey, string>;

export interface RoleTemplateOption {
  value: string;
  label: string;
  department: string;
}

export const ROLE_TEMPLATES: RoleTemplateOption[] = [
  { value: 'software-engineer', label: 'Software Engineer', department: 'Engineering' },
  { value: 'frontend-developer', label: 'Frontend Developer', department: 'Engineering' },
  { value: 'backend-developer', label: 'Backend Developer', department: 'Engineering' },
  { value: 'fullstack-developer', label: 'Full Stack Developer', department: 'Engineering' },
  { value: 'ml-engineer', label: 'ML Engineer', department: 'ML / Data Science' },
  { value: 'data-scientist', label: 'Data Scientist', department: 'ML / Data Science' },
  { value: 'data-analyst', label: 'Data Analyst', department: 'ML / Data Science' },
  { value: 'nlp-ai-engineer', label: 'NLP / AI Engineer', department: 'NLP / AI' },
  { value: 'devops-engineer', label: 'DevOps Engineer', department: 'Engineering' },
  { value: 'qa-engineer', label: 'QA Engineer', department: 'Engineering' },
  { value: 'ui-ux-designer', label: 'UI/UX Designer', department: 'Design' },
  { value: 'product-manager', label: 'Product Manager', department: 'Product' },
  { value: 'project-manager', label: 'Project Manager', department: 'Product' },
  { value: 'hr-executive', label: 'HR Executive', department: 'Human Resources' },
  { value: 'sales-executive', label: 'Sales Executive', department: 'Sales' },
  { value: 'marketing-specialist', label: 'Marketing Specialist', department: 'Marketing' },
  { value: 'customer-support', label: 'Customer Support Executive', department: 'Support' },
  { value: 'custom', label: 'Other / Custom Role', department: 'Other' },
];

export const DEPARTMENT_OPTIONS = [
  'Engineering',
  'ML / Data Science',
  'NLP / AI',
  'Web Development',
  'Design',
  'Product',
  'Human Resources',
  'Sales',
  'Marketing',
  'Support',
  'Other',
];

export const EXPERIENCE_OPTIONS = [
  '0-1 years',
  '1-2 years',
  '2-4 years',
  '3-5 years',
  '5+ years',
];

export const EMPLOYMENT_TYPE_OPTIONS = ['Full-time', 'Part-time', 'Internship', 'Contract'];

export const WORK_MODE_OPTIONS = ['Remote', 'Onsite', 'Hybrid'];

export function genericTemplate(
  role: string,
  department: string,
  experience: string,
  employmentType: string,
  workMode: string,
  location: string,
): JobTemplate {
  return {
    job_title: role,
    job_domain: department,
    job_type: employmentType,
    job_mode: workMode,
    experience_required: experience,
    location,
    description: `We are hiring a ${role} to join our ${department} team. The ideal candidate takes ownership of their work, communicates clearly, and delivers high-quality results on time.`,
    salary: 'Competitive',
    deadline: '',
    required_skills: 'Communication, Ownership, Problem Solving',
    preferred_skills: 'Team Collaboration, Time Management',
    responsibilities: `Own day-to-day ${role} responsibilities\nCollaborate with cross-functional stakeholders\nMaintain high quality standards and documentation\nContribute to continuous team improvement`,
    company_overview: '',
    benefits: 'Competitive compensation\nGrowth opportunities\nSupportive team culture',
    hiring_process: 'Application review\nInterview rounds\nOffer rollout',
    recruiter_notes: '',
  };
}

type TemplateBuilder = (
  experience: string,
  employmentType: string,
  workMode: string,
  location: string,
) => JobTemplate;

const TEMPLATES: Record<string, TemplateBuilder> = {
  'software-engineer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Software Engineer', 'Engineering', experience, employmentType, workMode, location),
    description:
      'We are hiring a Software Engineer to design, build, and maintain reliable software. You will work across the stack, ship clean code, and collaborate with product and design to deliver customer value.',
    required_skills: 'JavaScript, TypeScript, React, Node.js, REST APIs, Git',
    preferred_skills: 'Python, SQL, Docker, CI/CD, Testing (Jest/Vitest)',
    responsibilities: `Design and develop scalable software features\nWrite clean, tested, and maintainable code\nReview code and contribute to engineering standards\nDebug production issues and improve reliability\nCollaborate with product, design, and QA teams`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'frontend-developer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Frontend Developer', 'Web Development', experience, employmentType, workMode, location),
    description:
      'We are hiring a Frontend Developer to build responsive, accessible, and high-performing user interfaces. You will turn designs into polished product experiences.',
    required_skills: 'HTML, CSS, JavaScript, TypeScript, React, Responsive Design',
    preferred_skills: 'Tailwind CSS, State Management, Performance Optimization, Figma',
    responsibilities: `Build responsive interfaces from designs and specs\nMaintain reusable component libraries\nOptimize pages for speed and accessibility\nWork closely with designers and backend engineers\nFix UI bugs and polish user interactions`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'backend-developer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Backend Developer', 'Web Development', experience, employmentType, workMode, location),
    description:
      'We are hiring a Backend Developer to build secure, scalable APIs and services. You will own data modeling, integrations, and backend reliability.',
    required_skills: 'Node.js, Python, REST APIs, SQL, Authentication, Git',
    preferred_skills: 'FastAPI, PostgreSQL, Redis, Docker, Message Queues',
    responsibilities: `Design and build RESTful APIs and backend services\nModel data and manage relational databases\nImplement authentication and authorization\nWrite tests and monitor service health\nCollaborate with frontend and DevOps teams`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'fullstack-developer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Full Stack Developer', 'Web Development', experience, employmentType, workMode, location),
    description:
      'We are hiring a Full Stack Developer to deliver end-to-end product features across frontend and backend. You will own features from design through deployment.',
    required_skills: 'React, TypeScript, Node.js, REST APIs, SQL, Git',
    preferred_skills: 'Python, Docker, Cloud Deployment, Testing, CI/CD',
    responsibilities: `Deliver full-stack features from UI to database\nBuild and integrate APIs with frontend clients\nManage deployments and basic infrastructure needs\nEnsure quality through testing and reviews\nPartner with product and design on scope and delivery`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'ml-engineer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('ML Engineer', 'ML / Data Science', experience, employmentType, workMode, location),
    description:
      'We are hiring an ML Engineer to build, train, and deploy machine learning models into production. You will work with data pipelines, evaluation, and scalable serving.',
    required_skills: 'Python, Machine Learning, Scikit-learn, Pandas, SQL, Git',
    preferred_skills: 'PyTorch, TensorFlow, MLOps, Docker, Model Deployment',
    responsibilities: `Build and evaluate machine learning models\nPrepare datasets and engineer features\nDeploy models and monitor performance\nCollaborate with data and product teams\nDocument experiments and production behavior`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'data-scientist': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Data Scientist', 'ML / Data Science', experience, employmentType, workMode, location),
    description:
      'We are hiring a Data Scientist to turn data into decisions. You will analyze datasets, build models, and communicate insights that guide the business.',
    required_skills: 'Python, Statistics, SQL, Pandas, Data Visualization, Machine Learning',
    preferred_skills: 'Experiment Design, A/B Testing, BI Tools, Storytelling with Data',
    responsibilities: `Analyze data and communicate actionable insights\nBuild dashboards, reports, and predictive models\nPartner with product and business stakeholders\nValidate findings with sound statistical methods\nPresent results clearly to technical and non-technical audiences`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'data-analyst': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Data Analyst', 'ML / Data Science', experience, employmentType, workMode, location),
    description:
      'We are hiring a Data Analyst to track performance, uncover trends, and support decisions with reliable reporting and analysis.',
    required_skills: 'SQL, Excel, Data Visualization, Reporting, Python',
    preferred_skills: 'Power BI, Tableau, Statistics, Dashboard Design',
    responsibilities: `Build recurring reports and dashboards\nInvestigate trends and explain metric movements\nEnsure data accuracy and consistency\nSupport teams with ad-hoc analysis\nRecommend actions based on evidence`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'nlp-ai-engineer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('NLP / AI Engineer', 'NLP / AI', experience, employmentType, workMode, location),
    description:
      'We are hiring an NLP / AI Engineer to build intelligent language and AI-powered features. You will work with LLMs, embeddings, evaluation, and production AI systems.',
    required_skills: 'Python, NLP, LLMs, Prompt Engineering, REST APIs, Git',
    preferred_skills: 'LangChain, Vector Databases, PyTorch, Evaluation Pipelines, FastAPI',
    responsibilities: `Design and ship NLP and LLM-powered features\nBuild retrieval and evaluation pipelines\nIntegrate AI services with product workflows\nMonitor quality, safety, and cost of AI systems\nStay current with practical AI tooling and methods`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'devops-engineer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('DevOps Engineer', 'Engineering', experience, employmentType, workMode, location),
    description:
      'We are hiring a DevOps Engineer to keep releases fast and infrastructure reliable. You will own CI/CD, cloud environments, and observability.',
    required_skills: 'Linux, Docker, CI/CD, Git, Cloud (AWS/GCP/Azure), Networking Basics',
    preferred_skills: 'Kubernetes, Terraform, Monitoring, Scripting (Bash/Python)',
    responsibilities: `Maintain CI/CD pipelines and release processes\nManage cloud infrastructure and environments\nMonitor uptime, logs, and alerts\nImprove reliability, security, and cost efficiency\nSupport developers with tooling and automation`,
    salary: 'Competitive',
  }),
  'qa-engineer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('QA Engineer', 'Engineering', experience, employmentType, workMode, location),
    description:
      'We are hiring a QA Engineer to protect product quality through structured testing. You will plan test coverage, report defects clearly, and verify fixes.',
    required_skills: 'Manual Testing, Test Planning, Bug Reporting, Regression Testing, SDLC Basics',
    preferred_skills: 'Automation (Selenium/Playwright), API Testing, SQL, Agile',
    responsibilities: `Create test plans and test cases\nExecute functional and regression testing\nLog clear, reproducible defects\nVerify fixes and validate releases\nWork with developers to prevent recurring issues`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'ui-ux-designer': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('UI/UX Designer', 'Design', experience, employmentType, workMode, location),
    description:
      'We are hiring a UI/UX Designer to craft intuitive, beautiful product experiences. You will research users, design flows and interfaces, and iterate with feedback.',
    required_skills: 'Figma, User Research, Wireframing, Prototyping, Visual Design',
    preferred_skills: 'Design Systems, Usability Testing, Interaction Design, HTML/CSS Basics',
    responsibilities: `Understand user needs through research and feedback\nDesign wireframes, prototypes, and final UI\nMaintain and evolve the design system\nCollaborate with product and engineering\nValidate designs with usability testing`,
    salary: employmentType === 'Internship' ? 'Stipend based' : 'Competitive',
  }),
  'product-manager': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Product Manager', 'Product', experience, employmentType, workMode, location),
    description:
      'We are hiring a Product Manager to define what we build and why. You will own the roadmap, align stakeholders, and turn customer insight into shipped outcomes.',
    required_skills: 'Product Roadmaps, Requirements, Stakeholder Management, Analytics, Communication',
    preferred_skills: 'Agile/Scrum, User Research, Prioritization, SQL Basics, Wireframing',
    responsibilities: `Own roadmap and prioritize product initiatives\nWrite clear requirements and success metrics\nAlign engineering, design, and business teams\nUse data and feedback to guide decisions\nTrack launches and measure outcomes`,
    salary: 'Competitive',
  }),
  'project-manager': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Project Manager', 'Product', experience, employmentType, workMode, location),
    description:
      'We are hiring a Project Manager to keep delivery predictable and teams aligned. You will plan timelines, manage risks, and drive projects to completion.',
    required_skills: 'Project Planning, Scheduling, Risk Management, Communication, Documentation',
    preferred_skills: 'Agile/Scrum, Jira, Stakeholder Reporting, Budget Tracking',
    responsibilities: `Plan milestones, timelines, and dependencies\nCoordinate across teams and vendors\nTrack progress and manage risks\nRun standups and status reviews\nReport outcomes and lessons learned`,
    salary: 'Competitive',
  }),
  'hr-executive': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('HR Executive', 'Human Resources', experience, employmentType, workMode, location),
    description:
      'We are hiring an HR Executive to support hiring, onboarding, and people operations. You will help build a positive, compliant, and high-performing workplace.',
    required_skills: 'Recruitment, Onboarding, HR Operations, Communication, Documentation',
    preferred_skills: 'Sourcing, Interview Coordination, HRMS Tools, Employee Engagement',
    responsibilities: `Coordinate hiring and interview scheduling\nSupport onboarding and HR documentation\nMaintain employee records and compliance\nAssist with engagement and retention efforts\nPartner with managers on people needs`,
    salary: 'Competitive',
  }),
  'sales-executive': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Sales Executive', 'Sales', experience, employmentType, workMode, location),
    description:
      'We are hiring a Sales Executive to grow revenue through prospecting, demos, and closing. You will own pipeline activity and build lasting customer relationships.',
    required_skills: 'Prospecting, Negotiation, CRM, Communication, Target Ownership',
    preferred_skills: 'B2B Sales, Demo Skills, Lead Qualification, Market Research',
    responsibilities: `Prospect and qualify new opportunities\nRun demos and close deals\nMaintain accurate CRM records\nMeet or exceed sales targets\nBuild long-term client relationships`,
    salary: 'Competitive + incentives',
  }),
  'marketing-specialist': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Marketing Specialist', 'Marketing', experience, employmentType, workMode, location),
    description:
      'We are hiring a Marketing Specialist to grow awareness and demand. You will run campaigns, create content, and measure what moves the funnel.',
    required_skills: 'Content Creation, Campaigns, Social Media, SEO Basics, Analytics',
    preferred_skills: 'Email Marketing, Paid Ads, Copywriting, Design Tools',
    responsibilities: `Plan and execute marketing campaigns\nCreate content across channels\nTrack performance and optimize spend\nCoordinate launches with product and sales\nGrow brand presence and engagement`,
    salary: 'Competitive',
  }),
  'customer-support': (experience, employmentType, workMode, location) => ({
    ...genericTemplate('Customer Support Executive', 'Support', experience, employmentType, workMode, location),
    description:
      'We are hiring a Customer Support Executive to deliver fast, empathetic customer help. You will resolve issues, document cases, and improve the support experience.',
    required_skills: 'Customer Communication, Problem Solving, Ticketing Tools, Patience, Documentation',
    preferred_skills: 'Chat/Email Support, Product Knowledge, Escalation Handling, Multilingual Skills',
    responsibilities: `Respond to customer queries promptly\nTroubleshoot and resolve reported issues\nDocument cases and follow up to closure\nEscalate complex cases appropriately\nShare feedback to improve product and process`,
    salary: 'Competitive',
  }),
};

export interface TemplateSelection {
  roleValue: string;
  department: string;
  experience: string;
  employmentType: string;
  workMode: string;
  location: string;
}

export function getRoleOption(roleValue: string): RoleTemplateOption | undefined {
  return ROLE_TEMPLATES.find((r) => r.value === roleValue);
}

export function buildJobTemplate(selection: TemplateSelection): JobTemplate {
  const builder = TEMPLATES[selection.roleValue];
  if (builder) {
    return builder(selection.experience, selection.employmentType, selection.workMode, selection.location);
  }
  const roleLabel =
    selection.roleValue === 'custom' || !selection.roleValue
      ? 'General Role'
      : getRoleOption(selection.roleValue)?.label || selection.roleValue;
  return genericTemplate(
    roleLabel,
    selection.department || 'General',
    selection.experience,
    selection.employmentType,
    selection.workMode,
    selection.location,
  );
}

