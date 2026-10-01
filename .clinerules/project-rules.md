# MeLun — Project Rules

## 1. Core Project Principle

MeLun is an AI-powered hiring and applicant evaluation platform.

The goal is to build a professional, production-quality recruitment platform that helps:

- Companies create and manage job openings.
- Recruiters manage applicants.
- Applicants discover suitable opportunities.
- AI analyze resumes and applicant information.
- Match candidates to jobs based on skills, experience, qualifications, and role requirements.
- Reduce hiring bias and avoid overlooking qualified candidates.
- Provide useful reports, rankings, notifications, and hiring insights.

Treat MeLun as a real commercial SaaS product, not a demo or college prototype.

---

## 2. Existing Code Comes First

Before changing anything:

- Inspect the existing implementation.
- Understand the current architecture.
- Reuse existing components, utilities, APIs, hooks, schemas, and styles whenever possible.
- Do not create duplicate functionality.
- Do not replace working functionality just because another approach is possible.
- Do not perform large refactors unless explicitly requested.
- Do not modify unrelated files.

If an existing component already solves the problem, extend it instead of creating another version.

---

## 3. UI/UX Rules

The UI must feel like a modern, polished SaaS hiring platform.

Prioritize:

- Professional visual hierarchy.
- Clean spacing.
- Strong typography.
- Consistent cards.
- Consistent border radius.
- Consistent shadows.
- Clear navigation.
- Responsive layouts.
- Proper empty states.
- Loading states.
- Error states.
- Hover states.
- Active states.
- Accessible controls.

Avoid:

- Generic template-looking interfaces.
- Excessive gradients.
- Random colors.
- Unnecessary animations.
- Huge empty spaces.
- Overlapping components unless intentionally designed.
- Inconsistent card sizes.
- Inconsistent spacing.
- Placeholder-looking UI in finished sections.

When improving a page, preserve the existing design language unless a redesign is explicitly requested.

---

## 4. Visual Design

MeLun should look like a real SaaS product.

Use visual references from high-quality recruitment/SaaS products when appropriate, but do not copy another company's design directly.

For hero sections, landing pages, dashboards, and marketing sections:

- Use strong visual hierarchy.
- Use appropriate imagery or visual mockups where useful.
- Use realistic product screenshots/mockups when a visual is required.
- Prefer meaningful visual content over decorative placeholders.
- Keep backgrounds intentional.
- Ensure text remains readable over backgrounds.
- Maintain responsive behavior.

If assets are not available yet, use clearly replaceable mocks rather than breaking the layout.

---

## 5. No Unnecessary UI Changes

When the user asks to fix one specific UI problem:

ONLY change what is necessary to solve that problem.

For example:

If asked to fix card positioning:

- Do not redesign the cards.
- Do not change typography.
- Do not change colors.
- Do not change unrelated sections.
- Do not restructure the page.

Preserve everything else.

---

## 6. Responsive Design

Every UI change must consider:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

Do not create layouts that only work at one screen size.

Avoid:

- Fixed widths that cause overflow.
- Absolute positioning when normal layout systems can solve the problem.
- Text overflowing cards.
- Buttons overflowing containers.
- Tables breaking the page.
- Navigation collisions.

Use responsive CSS/layout techniques appropriately.

---

## 7. Frontend Rules

Before creating a new frontend component:

1. Search for an existing equivalent.
2. Reuse it if possible.
3. If a new component is required, make it reusable.
4. Keep component responsibilities clear.

Do not put large amounts of unrelated logic inside a single component.

Keep:

- UI logic.
- API calls.
- State management.
- Business logic.
- Utility functions

appropriately separated.

Do not introduce a new frontend library without checking whether the project already has an equivalent solution.

---

## 8. Backend Rules

Preserve the existing backend architecture.

Before adding an endpoint:

- Check whether a similar endpoint already exists.
- Check existing schemas/models.
- Check existing authentication/authorization.
- Check existing service functions.
- Reuse existing patterns.

Do not duplicate business logic across endpoints.

Validate all incoming data.

Handle:

- Authentication.
- Authorization.
- Validation.
- Errors.
- Database failures.
- Missing resources.

appropriately.

Never expose secrets, credentials, API keys, or sensitive configuration in source code.

---

## 9. Database Rules

Never modify the database structure casually.

Before changing:

- Models.
- Tables.
- Columns.
- Relationships.
- Indexes.
- Constraints.

inspect the current database design and dependencies.

Do not delete existing fields or data unless explicitly requested.

Prefer migrations for schema changes.

Never hard-code production database credentials.

---

## 10. AI Features

AI functionality must be treated as an important product feature, not decoration.

AI-generated results should be:

- Explainable where appropriate.
- Traceable to available applicant/job information.
- Consistent.
- Structured.
- Clearly separated from verified factual data.

Do not present AI guesses as guaranteed facts.

For applicant matching, consider relevant factors such as:

- Skills.
- Experience.
- Education.
- Job requirements.
- Relevant projects.
- Certifications.
- Role-specific requirements.

Avoid using protected/sensitive personal attributes for candidate ranking or hiring decisions.

AI should assist recruiters rather than secretly making irreversible employment decisions.

---

## 11. Applicant Privacy

Applicant data is sensitive.

Do not expose applicant information unnecessarily.

Protect:

- Resumes.
- Contact information.
- Application information.
- Interview information.
- Assessment results.
- AI analysis.
- Recruiter notes.

Do not log sensitive applicant information unnecessarily.

Do not expose private applicant data through public APIs.

Use authorization checks for applicant/recruiter/company resources.

---

## 12. Security

Security is a first-class requirement.

Always consider:

- Authentication.
- Authorization.
- Input validation.
- Rate limiting.
- Secure file uploads.
- SQL injection prevention.
- XSS prevention.
- CSRF protection where applicable.
- Secure API design.
- Password hashing.
- Token security.
- Environment variables.
- Access control.
- Sensitive-data protection.

Never commit:

- API keys.
- Passwords.
- JWT secrets.
- Database credentials.
- Private certificates.
- Production secrets.

Use environment variables/configuration for secrets.

---

## 13. Authentication & Authorization

Never assume that hiding a UI element provides security.

Backend authorization must independently verify access.

For every protected resource, verify:

- Who is requesting it.
- What role they have.
- Whether they own or are authorized to access the resource.

A recruiter from Company A must not be able to access Company B's private applicant data.

---

## 14. File Uploads

Applicant resumes and other uploaded files must be treated as untrusted input.

Validate:

- File type.
- File size.
- File name.
- File contents where appropriate.

Do not blindly execute or process uploaded files.

Store uploaded files securely.

Do not expose internal storage paths publicly.

---

## 15. API Integration

Before connecting frontend functionality to an API:

- Inspect the existing API.
- Confirm request format.
- Confirm response format.
- Check authentication requirements.
- Check error responses.

Do not invent API endpoints when an existing endpoint can be used.

If an API does not exist, clearly identify that before creating a new backend implementation.

---

## 16. Mock Data

Mock data is allowed during UI development.

However:

- Clearly structure mocks so they can later be replaced.
- Do not hard-code large datasets throughout UI components.
- Do not make mock data look like permanent backend logic.
- Do not claim that mock data is real data.
- When backend integration exists, prefer the real API.

Mocks should reproduce realistic production scenarios.

---

## 17. Reports & Notifications

Reports, dashboards, applicant statuses, rankings, and notifications must remain synchronized with the actual application state.

Avoid:

- Hard-coded counts.
- Fake dashboard statistics.
- Duplicate sources of truth.
- UI values that contradict backend data.

If a value comes from an API, use the API as the source of truth.

---

## 18. Applicant Statuses

Use the project's existing applicant-status definitions consistently.

Do not create slightly different status names in different modules.

Before introducing a new status:

- Search the project.
- Check backend models.
- Check frontend enums/constants.
- Check reports.
- Check notifications.

Update all dependent areas when a status genuinely needs to change.

---

## 19. Error Handling

Never silently swallow errors.

Provide appropriate:

- Loading states.
- Empty states.
- Error states.
- Retry options where useful.
- User-friendly error messages.

Do not expose raw backend stack traces or sensitive internal errors to users.

Developer logs may contain useful debugging information, but must not unnecessarily contain sensitive applicant data or credentials.

---

## 20. Performance

Avoid unnecessary:

- API requests.
- Database queries.
- Re-renders.
- Large client-side computations.
- Duplicate data fetching.
- Large assets.

Optimize only where useful; do not sacrifice maintainability for premature optimization.

---

## 21. Code Quality

Prefer:

- Clear names.
- Small reusable functions.
- Strong typing where supported.
- Existing project conventions.
- Minimal duplication.
- Maintainable code.

Avoid:

- Dead code.
- Temporary hacks left behind.
- Unused imports.
- Unused variables.
- Duplicate components.
- Massive functions.
- Magic numbers when constants are appropriate.

Do not leave TODOs for work that was supposedly completed.

---

## 22. Dependencies

Do not install a new package just because it is convenient.

Before adding a dependency:

1. Check whether the project already provides the functionality.
2. Check existing dependencies.
3. Prefer native/project-supported solutions.
4. Add a dependency only when it provides meaningful value.

Avoid unnecessary dependency growth.

---

## 23. Git Safety

Do not:

- Delete branches.
- Reset commits.
- Force push.
- Rewrite Git history.
- Remove unrelated changes.

unless explicitly instructed.

Do not overwrite the user's existing work.

Before making large changes, inspect the current Git status and relevant files.

---

## 24. Testing

After making changes:

- Run the relevant tests.
- Run type checking where applicable.
- Run linting where applicable.
- Verify the affected page/functionality.
- Check for console errors.
- Check API errors.
- Check responsive behavior for UI changes.

Do not claim a feature is complete without verifying it.

If tests cannot be run, state that clearly.

---

## 25. Debugging

When fixing a bug:

1. Reproduce or understand the failure.
2. Identify the root cause.
3. Make the smallest appropriate fix.
4. Verify the fix.
5. Check for regressions.

Do not randomly modify multiple unrelated files until the problem disappears.

---

## 26. Existing Architecture Is the Source of Truth

Do not assume the project uses a particular framework, folder structure, state-management system, database, or API architecture.

Inspect the repository first.

Follow the architecture that actually exists.

If the architecture needs to change, explain why before performing a major architectural change.

---

## 27. User Instructions Have Priority

Follow the user's latest explicit instruction.

If the user says:

- "Only change the positioning" → only change positioning.
- "Don't redesign it" → don't redesign it.
- "Use mocks for now" → use mocks.
- "Connect this to the API" → use the existing API where possible.
- "Give me the code only" → don't add unnecessary explanation.
- "Fix this specific bug" → focus on that bug.

Do not add unsolicited features.

---

## 28. Before Editing Files

Always perform this sequence:

1. Inspect relevant files.
2. Search for existing implementations.
3. Understand dependencies.
4. Identify the smallest required change.
5. Make the change.
6. Verify the result.

Never blindly overwrite files.

---

## 29. UI Change Protocol

For visual changes:

1. Inspect the existing page.
2. Identify the exact component/section.
3. Preserve existing behavior.
4. Modify only the requested visual area.
5. Check spacing and alignment.
6. Check responsive behavior.
7. Check for overlaps/overflow.
8. Verify that unrelated sections remain unchanged.

---

## 30. Production Mindset

Every implementation should answer:

> "Would this be acceptable in a real hiring SaaS product?"

Prioritize:

- Reliability.
- Security.
- Privacy.
- Maintainability.
- Accessibility.
- Performance.
- Professional UX.
- Clear architecture.

Do not optimize for merely making a screenshot look correct.

---

## 31. Final Verification

Before considering a task complete, verify:

- Requested functionality works.
- Existing functionality still works.
- No unrelated files were unnecessarily changed.
- No obvious console errors exist.
- No secrets were introduced.
- No sensitive data is unnecessarily exposed.
- UI is responsive.
- API contracts remain consistent.
- Tests/type checks/linting pass when applicable.

If something could not be verified, explicitly state what remains unverified.
