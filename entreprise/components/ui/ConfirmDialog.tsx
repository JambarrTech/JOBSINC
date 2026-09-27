'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { useDialogFocus } from './useDialogFocus';

/**
 * Boîte de dialogue de confirmation, remplace `window.confirm` / `window.alert`.
 *
 * Pourquoi les natifs ne conviennent plus :
 *  - ils sont SYNCHRONES : la fonction doit s'arrêter là et attendre un retour
 *    booléen. Impossible d'en faire un état React, donc impossible d'y brancher
 *    un rendu `loading`, ni de distinguer « l'utilisateur a annulé » d'une
 *    annulation clavier ;
 *  - leur rendu est imposé par l'agent utilisateur : il ignore
 *    `prefers-reduced-motion`, donc l'ouverture animée joue quand même chez
 *    qui l'a désactivée ;
 *  - le message n'est rattaché au titre par aucun `aria-labelledby` /
 *    `aria-describedby`, donc un lecteur d'écran l'énonce sans contexte ;
 *  - ils s'ouvrent dans la fenêtre système, ce qui fait perdre le focus à la
 *    page et casse le contexte de tabulation au retour.
 *
 * `useDialogFocus` prend le relais sur les points déjà traités dans
 * `app/dashboard/applications/[id]/page.tsx:60-122` : focus déplacé à
 * l'ouverture, piégé tant que le dialogue est ouvert, Échap ferme, et le
 * focus est restitué au bouton déclencheur.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'default',
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` pour une action irréversible (suppression) : l'accent bleu
   *  ferait passer la suppression pour une action anodine. */
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();

  // `onClose` et `busy` sont lus au moment de l'appel, via une ref rafraîchie
  // dans un effet, et `close` reste stable. En effet, `useDialogFocus` dépend
  // de l'identité de son second argument : si elle changeait à chaque rendu
  // (ce que fait une arrow function inline passée par le parent), l'effet
  // serait démonté/remonté en boucle et replacerait le focus sur le premier
  // élément du dialogue à chaque frappe de l'utilisateur. Ce défaut existait
  // déjà sur `MeetingJoinModal`, dont le `onClose` était lui aussi instable.
  const latest = useRef({ onClose, busy });
  useEffect(() => { latest.current = { onClose, busy }; });

  const close = useCallback(() => {
    // Pendant l'action, fermer reviendrait à perdre le message d'erreur sans
    // annuler l'opération en cours : on verrouille la fermeture.
    if (latest.current.busy) return;
    latest.current.onClose();
  }, []);

  useDialogFocus(dialogRef, close);

  return (
    <div className="dialog-overlay" role="presentation" onClick={close}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={close} aria-label="Fermer la boîte de dialogue">
            &times;
          </button>
        </div>
        <div className="dialog-body">
          <p id={messageId}>{message}</p>
        </div>
        <footer className="dialog-footer">
          <button type="button" className="button button-outline button-small" onClick={close} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button button-small ${tone === 'danger' ? 'button-danger' : 'button-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Veuillez patienter…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
