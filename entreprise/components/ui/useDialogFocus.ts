'use client';

import { RefObject, useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/**
 * Rend un `role="dialog" aria-modal="true"` réellement utilisable au clavier.
 *
 * Sans ce hook, la modale de connexion à l'entretien annonçait
 * `aria-modal="true"` mais :
 *  - ne déplaçait pas le focus à l'ouverture : la tabulation continuait
 *    derrière elle, dans la page, alors que l'écran était recouvert ;
 *  - ne capturait pas Échap, donc la seule façon de fermer était la souris
 *    (le clic sur le backdrop) ou le bouton « Fermer » atteint au hasard ;
 *  - ne restituait pas le focus à l'élément déclencheur : après fermeture, la
 *    tabulation repartait du début du document.
 *
 * Le focus est piégé dans le dialogue tant qu'il est ouvert, et Échap ferme.
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus initial : le premier élément focusable, sinon le dialogue lui-même
    // (auquel on donne un tabindex pour qu'il reçoive le focus).
    const initial = focusableWithin(container)[0] ?? container;
    if (!container.hasAttribute('tabindex') && initial === container) {
      container.setAttribute('tabindex', '-1');
    }
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = focusableWithin(container);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;

      // Piège : la tabulation ne sort jamais du dialogue.
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Restitution du focus au déclencheur.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [ref, onClose, active]);
}

/**
 * Ferme un menu ou une liste déroulante avec Échap, et rend le focus à son
 * déclencheur.
 *
 * Les trois menus de l'application (utilisateur, notifications, en-tête du
 * dashboard) s'ouvraient au clic, avec `aria-expanded` correct, mais sans
 * aucune gestion clavier : impossible de les refermer une fois ouverts.
 */
export function useEscapeToClose(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    // Mémorisé À L'OUVERTURE : le focus est encore sur le déclencheur (le
    // clic vient d'ouvrir le menu). L'ancien code capturait
    // `document.activeElement` au moment d'Échap — donc DANS le menu, retiré
    // du DOM par `onClose()` — puis testait `document.contains(trigger)` :
    // toujours faux, focus jamais restitué, retombée sur `<body>`.
    const triggerAtOpen = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const container = ref.current;
      if (!container) return;
      event.stopPropagation();
      onClose();
      // `onClose` retire le menu du DOM : le focus doit revenir au bouton
      // qui l'avait ouvert, sinon il tombe sur `<body>`.
      window.requestAnimationFrame(() => {
        if (triggerAtOpen && document.contains(triggerAtOpen)) {
          triggerAtOpen.focus();
          return;
        }
        const fallback = container.querySelector<HTMLElement>(
          'button[aria-expanded], button[aria-controls]',
        );
        if (fallback && document.contains(fallback)) fallback.focus();
      });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref, onClose, active]);
}
