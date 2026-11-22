import { useOrg } from '../api/queries';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { useProfile } from '../features/auth/context';
import { SettingsView } from '../features/settings/SettingsView';

export function SettingsPage() {
  const org = useOrg();
  const profile = useProfile();
  return (
    <div className="screen-page">
      <PageHeader crumbs={[{ label: profile.org.name, to: '/' }, { label: 'Settings' }]} title="Settings" />
      <QueryState query={org} loadingLabel="Loading settings…">
        {(data) => <SettingsView org={data.org} members={data.members} />}
      </QueryState>
    </div>
  );
}
