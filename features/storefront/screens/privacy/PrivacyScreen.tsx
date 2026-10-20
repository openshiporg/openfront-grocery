import { ShieldCheck } from 'lucide-react';
import { getUser } from '../../lib/data/user';
import { UrbanContainer, UrbanEmptyState, UrbanPageShell } from '../../modules/urban/UrbanPrimitives';
import PrivacyPage from './PrivacyPage';

// An anonymous visit is an expected state, not a failed privacy request.
// Do not mount the client (and its protected query) until a user is signed in.
export default async function PrivacyScreen() {
  const user = await getUser();
  if (!user) {
    return <UrbanPageShell><UrbanContainer className="space-y-6 py-8 sm:py-12">
      <h1 className="sf-title">Privacy & account data</h1>
      <UrbanEmptyState icon={ShieldCheck} title="Your privacy, in your hands" actionHref="/account/sign-in?from=%2Faccount%2Fprivacy" actionLabel="Sign in to your account">
        Sign in with your customer account to manage your data and review privacy requests.
      </UrbanEmptyState>
    </UrbanContainer></UrbanPageShell>;
  }
  return <PrivacyPage />;
}
