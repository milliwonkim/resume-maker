import { Suspense } from 'react';
import { ResumeEditorPage } from '@/components/resume/ResumeEditorPage';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">불러오는 중...</div>}>
      <ResumeEditorPage resumeId={id} />
    </Suspense>
  );
}
