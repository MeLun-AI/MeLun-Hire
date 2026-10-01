import LegalPageShell from './LegalPageShell';
import { PRIVACY_SECTIONS } from './legalContent';

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      description="This policy explains how MeLun collects, uses, and protects the information you share with MeLun Hire."
      lastUpdated="Last updated: 1 January 2026"
      sections={PRIVACY_SECTIONS}
    />
  );
}