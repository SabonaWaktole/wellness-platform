import { useEffect, useRef, useState } from 'react';
import { subscribeToDom } from './domObserverHub';
import { findLayer } from './layerStack';

/**
 * How long a layer must stay gone before it counts as closed. Its exit
 * animation keeps it in the page for a moment, and a re-render can swap it for
 * an identical one; neither should read as the user closing it.
 */
export const LAYER_EXIT_GRACE_MS = 600;

interface Handlers {
  onOpen: () => void;
  onClose: () => void;
}

/**
 * Tells the tour when the layer a step opens appears and when it is closed.
 * Returns whether the layer is open, which stays true through the exit grace,
 * so the controls inside it are not reported lost while it fades out.
 */
export function useLayerWatcher(layerId: string | null, handlers: Handlers): boolean {
  const [open, setOpen] = useState(false);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!layerId) {
      setOpen(false);
      return;
    }
    let isOpen = false;
    let grace: ReturnType<typeof setTimeout> | null = null;

    const clearGrace = () => {
      if (grace !== null) clearTimeout(grace);
      grace = null;
    };

    const check = () => {
      const present = findLayer(document, layerId) !== null;
      if (present) {
        clearGrace();
        if (!isOpen) {
          isOpen = true;
          setOpen(true);
          latest.current.onOpen();
        }
      } else if (isOpen && grace === null) {
        grace = setTimeout(() => {
          grace = null;
          if (findLayer(document, layerId) !== null) return;
          isOpen = false;
          setOpen(false);
          latest.current.onClose();
        }, LAYER_EXIT_GRACE_MS);
      }
    };

    check();
    const unsubscribe = subscribeToDom(check);
    return () => {
      unsubscribe();
      clearGrace();
      setOpen(false);
    };
  }, [layerId]);

  return open;
}
