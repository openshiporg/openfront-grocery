import { getUser } from '../../lib/data/user';
import { UrbanContainer, UrbanEmptyState, UrbanPageShell } from '../../modules/urban/UrbanPrimitives';
import PrivacyPage from './PrivacyPage';

// An anonymous visit is an expected state, not a failed privacy request.
// Do not mount the client (and its protected query) until a user is signed in.
export default async function PrivacyScreen() {
  const user = await getUser();
  if (!user) {
    return <UrbanPageShell><UrbanContainer className="space-y-6 py-10">
      <header><p className="sf-eyebrow">Your account</p><h1 className="sf-title mt-2">Privacy & account data</h1></header>
      <UrbanEmptyState title="Your privacy, in your hands" actionHref="/dashboard/signin?from=%2Faccount%2Fprivacy" actionLabel="Sign in to your account">
        Sign in with your customer account to manage your data and review privacy requests.
      </UrbanEmptyState>
    </UrbanContainer></UrbanPageShell>;
  }
  return <PrivacyPage />;
}
