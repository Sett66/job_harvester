import { useState } from 'react';
import { ApplicationsPage } from '@/features/applications';
import { DebriefPage } from '@/features/debrief';
import { QuestionsPage } from '@/features/questions';
import { Button } from '@/components/ui/button';

type Tab = 'applications' | 'debrief' | 'questions';

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
            variant={tab === 'debrief' ? 'default' : 'secondary'}
            onClick={() => setTab('debrief')}
          >
            复盘
          </Button>
          <Button
            variant={tab === 'questions' ? 'default' : 'secondary'}
            onClick={() => setTab('questions')}
          >
            题库
          </Button>
        </div>
      </nav>
      {tab === 'applications' ? (
        <ApplicationsPage />
      ) : tab === 'debrief' ? (
        <DebriefPage />
      ) : (
        <QuestionsPage />
      )}
    </div>
  );
}
