import MessagesOverview from '@/components/dashboard/MessagesOverview';

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string | string[] }> }) {
  const params = await searchParams;
  const raw = params.conversation;
  const initialConversationId = Array.isArray(raw) ? raw[0] : raw;
  return <MessagesOverview initialConversationId={initialConversationId} />;
}
