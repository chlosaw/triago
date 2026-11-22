import { useParams } from 'react-router-dom';
import { useTicket } from '../api/queries';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { useProfile } from '../features/auth/context';
import { TicketDetail } from '../features/tickets/TicketDetail';

/** One ticket on its own page, like a Jira issue view. */
export function TicketPage() {
  const { id = '' } = useParams();
  const { org } = useProfile();
  const ticket = useTicket(id);

  return (
    <div className="screen-page ticket-page">
      <QueryState query={ticket} loadingLabel="Loading ticket…">
        {({ ticket: t }) => (
          <>
            <PageHeader
              crumbs={[{ label: org.name, to: '/' }, { label: 'All tickets', to: '/tickets' }, { label: t.key }]}
              title={<span className="visually-hidden">{t.key}</span>}
            />
            <TicketDetail ticket={t} />
          </>
        )}
      </QueryState>
    </div>
  );
}
