/**
 * Quick links for the hub. These point at the tools the firm already pays for
 * (Microsoft 365, Loxo) rather than rebuilding them. Override any URL with an
 * environment variable so you can set real tenant links without code changes.
 */
export interface HubLink {
  title: string;
  description: string;
  href: string;
  group: 'Work' | 'People' | 'Tools';
}

const env = (key: string, fallback: string) => process.env[key]?.trim() || fallback;

// Microsoft's built-in Approvals app inside Teams. This app ID is the same
// across every Microsoft 365 tenant — it's Microsoft's app, not ours.
const TEAMS_APPROVALS_LINK = 'https://teams.microsoft.com/l/entity/7c316234-ded0-4f95-8a83-8453d0876592/approvals';

export const HUB_LINKS: HubLink[] = [
  {
    title: 'Company news & policies',
    description: 'Announcements, policies, and documents on SharePoint.',
    href: env('LINK_SHAREPOINT', 'https://www.office.com/launch/sharepoint'),
    group: 'Work'
  },
  {
    title: 'Teams',
    description: 'Chat, calls, and channels.',
    href: env('LINK_TEAMS', 'https://teams.microsoft.com'),
    group: 'Work'
  },
  {
    title: 'Files (OneDrive)',
    description: 'Shared and personal files.',
    href: env('LINK_ONEDRIVE', 'https://www.office.com/launch/onedrive'),
    group: 'Work'
  },
  {
    title: 'Planner & tasks',
    description: 'Project boards and task tracking.',
    href: env('LINK_PLANNER', 'https://tasks.office.com'),
    group: 'Work'
  },
  {
    title: 'Staff directory',
    description: 'Find anyone in the company.',
    href: env('LINK_DIRECTORY', 'https://www.office.com/launch/people'),
    group: 'People'
  },
  {
    title: 'PTO & approvals',
    description: 'Request time off and approve requests.',
    href: env('LINK_PTO', TEAMS_APPROVALS_LINK),
    group: 'People'
  },
  {
    title: 'Expenses',
    description: 'Submit and approve expenses.',
    href: env('LINK_EXPENSES', TEAMS_APPROVALS_LINK),
    group: 'People'
  },
  {
    title: 'Benefits',
    description: 'Enrollment and benefits portal.',
    href: env('LINK_BENEFITS', '#'),
    group: 'People'
  },
  {
    title: 'Loxo ATS',
    description: 'Candidate sourcing and pipeline.',
    href: env('LINK_LOXO', 'https://app.loxo.co'),
    group: 'Tools'
  },
  {
    title: 'Ringover',
    description: 'Phone, dialer, and call history.',
    href: env('LINK_RINGOVER', 'https://app.ringover.com'),
    group: 'Tools'
  }
];