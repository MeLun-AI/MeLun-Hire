import LegalPageShell from './LegalPageShell';
import { TERMS_SECTIONS } from './legalContent';

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      description="These terms govern your access to and use of MeLun Hire, the AI-assisted hiring platform provided by MeLun."
      lastUpdated="Last updated: 1 January 2026"
      sections={TERMS_SECTIONS}
    />
  );
}