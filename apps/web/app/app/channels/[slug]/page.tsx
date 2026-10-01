'use client';

import { use } from 'react';
import { ChannelView } from '@/components/mock-views/ChannelView';

export default function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  return <ChannelView slug={resolvedParams.slug} />;
}
