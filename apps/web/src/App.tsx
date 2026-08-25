import { useState } from 'react';
import { ApplicationsPage } from '@/features/applications';
import { ApplicationDetailPage } from '@/features/applications/detail/ApplicationDetailPage';
import { DashboardPage } from '@/features/board';
import { LlmDebugPage } from '@/features/llm-debug';
import { MailsPage } from '@/features/mails';
import { ReviewQueuePage } from '@/features/review-queue';
import { Button } from '@/components/ui/button';

type Tab = 'dashboard' | 'applications' | 'mails' | 'review-queue' | 'llm-debug';

type DetailView = {
  applicationId: string;
  companyName: string;
  returnTab: Tab;
};

const fixedViewportTabs: Tab[] = ['dashboard', 'mails'];

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
      <div className="h-full overflow-y-auto">
        <ApplicationDetailPage
          applicationId={detail.applicationId}
          companyName={detail.companyName}
          onBack={closeDetail}
        />
      </div>
    );
  }

  const mainOverflowClass = fixedViewportTabs.includes(tab)
    ? 'overflow-hidden'
    : 'overflow-y-auto';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
          <Button
            variant={tab === 'mails' ? 'default' : 'secondary'}
            onClick={() => setTab('mails')}
          >
            邮件
          </Button>
          <Button
            variant={tab === 'review-queue' ? 'default' : 'secondary'}
            onClick={() => setTab('review-queue')}
          >
            确认队列
          </Button>
          <Button
            variant={tab === 'llm-debug' ? 'default' : 'secondary'}
            onClick={() => setTab('llm-debug')}
          >
            LLM 调试
          </Button>
        </div>
      </nav>
      <main className={`min-h-0 flex-1 ${mainOverflowClass}`}>
        {tab === 'dashboard' ? (
          <DashboardPage
            onOpenApplication={(id, name) => openApplication(id, name, 'dashboard')}
            onOpenApplicationsList={() => setTab('applications')}
          />
        ) : tab === 'applications' ? (
          <ApplicationsPage
            onBack={() => setTab('dashboard')}
            onOpenApplication={(id, name) =>
              openApplication(id, name, 'applications')
            }
          />
        ) : tab === 'mails' ? (
          <MailsPage />
        ) : tab === 'review-queue' ? (
          <ReviewQueuePage />
        ) : (
          <LlmDebugPage />
        )}
      </main>
    </div>
  );
}
