import { useState } from 'react';
import { ApplicationsPage } from '@/features/applications';
import { ReviewQueuePage } from '@/features/review-queue';
import { Button } from '@/components/ui/button';

type Tab = 'applications' | 'review-queue';

export function App() {
  const [tab, setTab] = useState<Tab>('applications');

  return (
    <div>
      <nav className="border-b bg-background">
        <div className="mx-auto flex max-w-[1400px] gap-2 p-4">
          <Button
            variant={tab === 'applications' ? 'default' : 'secondary'}
            onClick={() => setTab('applications')}
          >
            投递
          </Button>
          <Button
            variant={tab === 'review-queue' ? 'default' : 'secondary'}
            onClick={() => setTab('review-queue')}
          >
            确认队列
          </Button>
        </div>
      </nav>
      {tab === 'applications' ? <ApplicationsPage /> : <ReviewQueuePage />}
    </div>
  );
}
