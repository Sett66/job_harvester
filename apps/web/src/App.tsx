import { useState } from 'react';
import { ApplicationsPage } from '@/features/applications';
import { ApplicationDetailPage } from '@/features/applications/detail/ApplicationDetailPage';
import { DashboardPage } from '@/features/board';
import { Button } from '@/components/ui/button';

type Tab = 'dashboard' | 'applications';

type DetailView = {
  applicationId: string;
  companyName: string;
  returnTab: Tab;
};

export function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [detail, setDetail] = useState<DetailView | null>(null);

  function openApplication(
    applicationId: string,
    companyName: string,
    returnTab: Tab = tab,
  ) {
    setDetail({ applicationId, companyName, returnTab });
  }

  function closeDetail() {
    if (detail) {
      setTab(detail.returnTab);
    }
    setDetail(null);
  }

  if (detail) {
    return (
      <ApplicationDetailPage
        applicationId={detail.applicationId}
        companyName={detail.companyName}
        onBack={closeDetail}
      />
    );
  }

  return (
    <div
      className={
        tab === 'dashboard' ? 'flex h-screen flex-col overflow-hidden' : undefined
      }
    >
      <nav className="shrink-0 border-b bg-background">
        <div className="mx-auto flex max-w-[1400px] gap-2 p-4">
          <Button
            variant={tab === 'dashboard' ? 'default' : 'secondary'}
            onClick={() => setTab('dashboard')}
          >
            看板
          </Button>
          <Button
            variant={tab === 'applications' ? 'default' : 'secondary'}
            onClick={() => setTab('applications')}
          >
            全部投递
          </Button>
        </div>
      </nav>
      {tab === 'dashboard' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <DashboardPage
            onOpenApplication={(id, name) => openApplication(id, name, 'dashboard')}
            onOpenApplicationsList={() => setTab('applications')}
          />
        </div>
      ) : (
        <ApplicationsPage
          onBack={() => setTab('dashboard')}
          onOpenApplication={(id, name) =>
            openApplication(id, name, 'applications')
          }
        />
      )}
    </div>
  );
}
