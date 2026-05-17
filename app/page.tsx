import { Suspense } from 'react';
import { ResumeDashboard } from '@/components/dashboard/ResumeDashboard';

export default function Home() {
  return (
    <Suspense>
      <ResumeDashboard />
    </Suspense>
  );
}
