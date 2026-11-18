import { useOrg } from '../api/queries';
import { QueryState } from '../components/QueryState';
import { SettingsView } from '../features/settings/SettingsView';

export function SettingsPage() {
  const org = useOrg();
  return (
    <div className="screen-page">
      <QueryState query={org} loadingLabel="Loading settings…">
        {(data) => <SettingsView org={data.org} members={data.members} />}
      </QueryState>
    </div>
  );
}
