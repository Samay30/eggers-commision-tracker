import { ConfidentialClientApplication } from '@azure/msal-node';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to enable Microsoft sign-in.`);
  }
  return value;
}

let cachedClient: ConfidentialClientApplication | null = null;

export function getMsalClient(): ConfidentialClientApplication {
  if (cachedClient) return cachedClient;
  cachedClient = new ConfidentialClientApplication({
    auth: {
      clientId: required('AZURE_AD_CLIENT_ID'),
      clientSecret: required('AZURE_AD_CLIENT_SECRET'),
      authority: `https://login.microsoftonline.com/${required('AZURE_AD_TENANT_ID')}`
    }
  });
  return cachedClient;
}

export const ENTRA_SCOPES = ['openid', 'profile', 'email', 'User.Read'];

export function getEntraRedirectUri(): string {
  const base = required('BASE_URL').replace(/\/+$/, '');
  return `${base}/api/auth/entra/callback`;
}
