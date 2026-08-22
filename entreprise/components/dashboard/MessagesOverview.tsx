'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { CompanyMessage, ChatMessage, ChatConversation, getCompanyMessages, getConversationPage, sendMessage, markConversationRead, getCompanyApplications } from '@/lib/api';

// Statuts autorisant la messagerie (même règle côté backend).
const MESSAGING_STATUSES = ['INTERVIEW', 'ACCEPTED'];
const APPLICATION_STATUS_LABELS: Record<string, string> = { INTERVIEW: 'Entretien', ACCEPTED: 'Acceptée' };
const CHAT_PAGE_SIZE = 50;

function mergeById(previous: ChatMessage[], incoming: ChatMessage[]) {
  const known = new Set(previous.map((message) => message.id));
  const merged = [...previous];
  for (const message of incoming) {
    if (!known.has(message.id)) {
      merged.push(message);
      known.add(message.id);
    }
  }
  return merged;
}

function participant(message: CompanyMessage) { return message.participantName || message.senderName || message.name || 'Contact'; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C'; }

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatSidebarDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function MessagesOverview({ initialConversationId }: { initialConversationId?: string }) {
  const [conversations, setConversations] = useState<CompanyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatConv, setChatConv] = useState<ChatConversation | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [searchCandidate, setSearchCandidate] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [newSubject, setNewSubject] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const skipScrollRef = useRef(false);
  const chatMessagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const loadConversations = useCallback(() => {
    setLoading(true);
    setError(false);
    getCompanyMessages().then((response) => setConversations(response || [])).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Conversation à ouvrir automatiquement depuis l'URL (?conversation=…)
  // : valeur DÉRIVÉE (aucun effet ni setState supplémentaire).
  const autoOpenId = useMemo(() => {
    if (!initialConversationId || loading || selectedConvId || showNewConversation) return null;
    return conversations.find((c) => String(c.id) === String(initialConversationId))?.id ?? null;
  }, [conversations, loading, initialConversationId, selectedConvId, showNewConversation]);
  const activeConvId = selectedConvId ?? autoOpenId;

  const filtered = useMemo(() => conversations.filter((c) => `${participant(c)} ${c.subject || ''} ${c.preview || ''}`.toLowerCase().includes(query.toLowerCase())), [conversations, query]);
  const selected = activeConvId ? (conversations.find((c) => String(c.id) === String(activeConvId)) || null) : null;
  const unreadCount = conversations.filter((c) => c.unread || c.read === false).length;

  const loadChat = useCallback(async (conversationId: string | number) => {
    setLoadingChat(true);
    try {
      const response = await getConversationPage(conversationId, { limit: CHAT_PAGE_SIZE });
      setChatMessages(response.messages || []);
      setChatConv(response.conversation || null);
      setHasMore(Boolean(response.hasMore));
      markConversationRead(conversationId).catch(() => {});
      setConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, unread: false, read: true, unreadCount: 0 } : c));
    } catch {
      setChatMessages([]);
      setChatConv(null);
      setHasMore(false);
    } finally {
      setLoadingChat(false);
    }
  }, []);

  useEffect(() => {
    if (activeConvId) loadChat(activeConvId);
  }, [activeConvId, loadChat]);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ------------------------------------------------------------
  // TEMPS RÉEL (polling incrémental de la conversation active).
  // Aucun WebSocket côté backend : on interroge uniquement les
  // messages postérieurs au dernier connu (paramètre after).
  // ------------------------------------------------------------
  useEffect(() => {
    if (!activeConvId || showNewConversation) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const anchor = [...chatMessagesRef.current].reverse().find((message) => !message.id.startsWith('temp-'));
      if (!anchor) return;
      getConversationPage(activeConvId, { after: anchor.id })
        .then((response) => {
          const fresh = response.messages || [];
          if (fresh.length === 0) return;
          skipScrollRef.current = false;
          setChatMessages((prev) => mergeById(prev, fresh));
          const last = fresh[fresh.length - 1];
          setConversations((prev) => prev.map((c) => String(c.id) === String(activeConvId)
            ? { ...c, preview: last.content.substring(0, 120), date: last.createdAt }
            : c));
          markConversationRead(activeConvId).catch(() => {});
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [activeConvId, showNewConversation]);

  const loadOlder = async () => {
    if (!activeConvId || !hasMore || loadingOlder || chatMessages.length === 0) return;
    setLoadingOlder(true);
    try {
      const response = await getConversationPage(activeConvId, { limit: CHAT_PAGE_SIZE, before: chatMessages[0].id });
      const older = response.messages || [];
      setHasMore(Boolean(response.hasMore));
      skipScrollRef.current = true;
      setChatMessages((prev) => {
        const known = new Set(prev.map((message) => message.id));
        return [...older.filter((message) => !known.has(message.id)), ...prev];
      });
    } catch {
      // Silencieux : l'historique déjà affiché reste utilisable.
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const content = newMessage.trim();
    setNewMessage('');
    setSending(true);
    try {
      if (selected && selected.candidateUserId) {
        const result = await sendMessage(selected.candidateUserId, content);
        setChatMessages((prev) => [...prev, {
          id: result.id || String(Date.now()),
          senderId: result.senderId || '',
          content,
          isRead: false,
          isMine: true,
          createdAt: result.createdAt || new Date().toISOString(),
        }]);
        setConversations((prev) => prev.map((c) => c.id === selectedConvId ? { ...c, preview: content.substring(0, 120), date: new Date().toISOString(), read: true, unread: false } : c));
      } else if (selectedCandidate) {
        const result = await sendMessage(selectedCandidate.userId || selectedCandidate.id, content, newSubject || undefined);
        const newConvId = result.conversationId || String(Date.now());
        setConversations((prev) => [{
          id: newConvId,
          conversationId: newConvId,
          participantName: selectedCandidate.name || `${selectedCandidate.firstName || ''} ${selectedCandidate.lastName || ''}`.trim(),
          candidateUserId: selectedCandidate.userId || selectedCandidate.id,
          avatar: selectedCandidate.avatar || null,
          subject: newSubject || 'Conversation de recrutement',
          preview: content.substring(0, 120),
          content,
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          unread: false,
          read: true,
        }, ...prev]);
        setSelectedConvId(newConvId);
        setShowNewConversation(false);
        setSelectedCandidate(null);
        setNewSubject('');
      }
    } catch {
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openNewConversation = async () => {
    setShowNewConversation(true);
    setSelectedConvId(null);
    try {
      const apps = await getCompanyApplications();
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const app of (apps || [])) {
        // Règle métier : seuls les candidats en entretien ou recrutés
        // peuvent être contactés par messagerie.
        if (!MESSAGING_STATUSES.includes((app as any).status)) continue;
        const id = (app as any).candidateProfileId || (app as any).candidate?.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          unique.push({
            id,
            userId: (app as any).candidate?.userId || id,
            name: (app as any).candidateName || (app as any).candidate?.firstName ? `${(app as any).candidate?.firstName || ''} ${(app as any).candidate?.lastName || ''}`.trim() : 'Candidat',
            avatar: (app as any).candidateAvatar || (app as any).candidate?.avatarUrl || null,
            jobTitle: (app as any).jobTitle || (app as any).job?.title || '',
            status: (app as any).status || '',
          });
        }
      }
      setCandidates(unique);
    } catch {
      setCandidates([]);
    }
  };

  return (
    <section className="messages-page">
      <div className="dashboard-page-heading">
        <div>
          <span className="dashboard-eyebrow">Échanges recrutement</span>
          <h1>Messages</h1>
          <p>Gardez le contact avec les candidats et les personnes qui suivent vos recrutements.</p>
        </div>
        <div className="messages-heading-actions">
          <div className="messages-count">
            <strong>{unreadCount}</strong>
            <span>non lu{unreadCount > 1 ? 's' : ''}</span>
          </div>
          <button type="button" className="button button-primary button-small" onClick={openNewConversation}>
            <Icon name="mail" size={14} /> Nouveau message
          </button>
        </div>
      </div>

      {error ? (
        <div className="dashboard-state dashboard-error">
          <strong>Impossible de charger les messages.</strong>
          <button type="button" className="button button-outline button-small" onClick={loadConversations}>Réessayer</button>
        </div>
      ) : (
        <div className="messages-workspace">
          <aside className="messages-list-panel">
            <div className="messages-list-header">
              <h2>Boîte de réception</h2>
              <span>{conversations.length} échange{conversations.length > 1 ? 's' : ''}</span>
            </div>
            <label className="jobs-search">
              <Icon name="search" size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans les messages…" aria-label="Rechercher un message" />
            </label>
            {loading ? (
              <div className="messages-skeleton">
                {[1, 2, 3, 4].map((item) => <div key={item}><i /><span /><b /></div>)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="messages-list-empty">
                <Icon name="mail" size={23} />
                <strong>{conversations.length ? 'Aucun résultat' : 'Votre boîte est vide'}</strong>
                <p>{conversations.length ? 'Essayez un autre terme de recherche.' : 'Commencez une conversation avec un candidat.'}</p>
              </div>
            ) : (
              <div className="messages-list">
                {filtered.map((message, index) => {
                  const name = participant(message);
                  const id = message.id ?? index;
                  const active = String(selected?.id ?? '') === String(id);
                  const unread = message.unread || message.read === false;
                  return (
                    <button type="button" className={`message-row ${active ? 'active' : ''} ${unread ? 'unread' : ''}`} key={id} onClick={() => { setSelectedConvId(id); setShowNewConversation(false); }}>
                      <div className="candidate-avatar">{initials(name)}</div>
                      <div className="message-row-copy">
                        <strong>{name}</strong>
                        <span>{message.jobTitle || message.subject || message.preview || 'Conversation'}</span>
                        <small>{message.preview || message.content || 'Aucun message'}</small>
                      </div>
                      <div className="message-row-meta">
                        <time>{formatSidebarDate(message.date || message.createdAt || '')}</time>
                        {unread && <span className="message-unread-dot" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <main className="message-detail-panel">
            {showNewConversation ? (
              <div className="message-new-conversation">
                <div className="message-detail-head">
                  <div className="candidate-avatar large">
                    <Icon name="mail" size={20} />
                  </div>
                  <div>
                    <span className="dashboard-eyebrow">Nouvelle conversation</span>
                    <h2>Nouveau message</h2>
                    <p>Candidats en entretien ou recrutés uniquement</p>
                  </div>
                </div>
                <div className="message-candidate-picker">
                  <label className="jobs-search">
                    <Icon name="search" size={16} />
                    <input value={searchCandidate} onChange={(e) => setSearchCandidate(e.target.value)} placeholder="Rechercher un candidat…" aria-label="Rechercher un candidat" />
                  </label>
                  <div className="message-candidate-list">
                    {candidates.filter((c) => `${c.name} ${c.jobTitle}`.toLowerCase().includes(searchCandidate.toLowerCase())).length === 0 ? (
                      <div className="messages-list-empty">
                        <Icon name="users" size={23} />
                        <strong>Aucun candidat contactable</strong>
                        <p>Seuls les candidats en entretien ou recrutés peuvent être contactés.</p>
                      </div>
                    ) : (
                      candidates.filter((c) => `${c.name} ${c.jobTitle}`.toLowerCase().includes(searchCandidate.toLowerCase())).map((c) => (
                        <button type="button" key={c.id} className={`message-row ${selectedCandidate?.id === c.id ? 'active' : ''}`} onClick={() => setSelectedCandidate(c)}>
                          <div className="candidate-avatar">{initials(c.name)}</div>
                          <div className="message-row-copy">
                            <strong>{c.name}</strong>
                            <span>{[c.jobTitle, APPLICATION_STATUS_LABELS[c.status]].filter(Boolean).join(' · ') || 'Candidat'}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                {selectedCandidate && (
                  <div className="message-compose-area">
                    <label className="message-subject-field">
                      <span>Sujet (optionnel)</span>
                      <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Ex: Suite à votre candidature…" />
                    </label>
                    <div className="message-compose">
                      <textarea rows={3} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} placeholder={`Écrire un message à ${selectedCandidate.name}…`} aria-label="Nouveau message" />
                      <button type="button" className="button button-primary" onClick={handleSend} disabled={!newMessage.trim() || sending}>
                        {sending ? 'Envoi…' : 'Envoyer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : selected ? (
              <>
                <div className="message-detail-head">
                  <div className="candidate-avatar large">
                    {chatConv?.avatar ? (
                      <img src={chatConv.avatar} alt="" />
                    ) : (
                      initials(chatConv?.participantName || participant(selected))
                    )}
                  </div>
                  <div>
                    <span className="dashboard-eyebrow">Conversation</span>
                    <h2>{chatConv?.participantName || participant(selected)}</h2>
                    <p>{chatConv?.jobTitle || chatConv?.subject || selected.subject || 'Échange de recrutement'}</p>
                  </div>
                </div>
                <div className="message-detail-body">
                  {loadingChat ? (
                    <div className="messages-skeleton">
                      {[1, 2, 3].map((item) => <div key={item}><i /><span /><b /></div>)}
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="message-detail-empty">
                      <Icon name="mail" size={25} />
                      <h2>Aucun message</h2>
                      <p>Commencez la conversation en envoyant un message.</p>
                    </div>
                  ) : (
                    <>
                      {hasMore && (
                        <button
                          type="button"
                          className="button button-outline button-small"
                          onClick={loadOlder}
                          disabled={loadingOlder}
                          style={{ display: 'block', margin: '0 auto 12px' }}
                        >
                          {loadingOlder ? 'Chargement…' : 'Charger les messages précédents'}
                        </button>
                      )}
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className={`message-bubble ${msg.isMine ? 'message-bubble-outgoing' : 'message-bubble-incoming'}`}>
                          <span>{msg.isMine ? 'Vous' : (chatConv?.participantName || participant(selected))}</span>
                          <p>{msg.content}</p>
                          <time>{formatTime(msg.createdAt)}</time>
                        </div>
                      ))}
                    </>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="message-compose">
                  <textarea rows={2} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} placeholder="Écrire un message…" aria-label="Réponse au message" />
                  <button type="button" className="button button-primary" onClick={handleSend} disabled={!newMessage.trim() || sending}>
                    {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              </>
            ) : (
              <div className="message-detail-empty">
                <div className="matching-empty-icon"><Icon name="mail" size={25} /></div>
                <h2>Sélectionnez une conversation</h2>
                <p>Choisissez un échange dans votre boîte de réception ou commencez une nouvelle conversation.</p>
              </div>
            )}
          </main>
        </div>
      )}
    </section>
  );
}
