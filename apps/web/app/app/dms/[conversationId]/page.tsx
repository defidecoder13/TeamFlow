'use client';

import { use } from 'react';
import { DmView } from '@/components/mock-views/DmView';

export default function DmPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const resolvedParams = use(params);
  return <DmView conversationId={resolvedParams.conversationId} />;
}
