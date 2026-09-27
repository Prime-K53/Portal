import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from './Toast';

export interface UndoAction {
  label: string;
  onUndo: () => void;
  duration?: number;
}

let undoIdCounter = 0;

export function useUndo() {
  const [pendingAction, setPendingAction] = useState<UndoAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const executeWithUndo = useCallback(
    (action: UndoAction) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setPendingAction(action);
      toast({
        type: 'info',
        title: action.label,
        description: 'Action undone. Press Ctrl+Z to revert.',
        duration: 0,
      });

      timerRef.current = setTimeout(() => {
        setPendingAction(null);
      }, action.duration ?? 5000);
    },
    [toast]
  );

  const undo = useCallback(() => {
    if (pendingAction) {
      pendingAction.onUndo();
      toast({
        type: 'success',
        title: 'Undone',
        description: `${pendingAction.label} has been reverted.`,
      });
      setPendingAction(null);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    }
  }, [pendingAction, toast]);

  const dismiss = useCallback(() => {
    setPendingAction(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  return { pendingAction, executeWithUndo, undo, dismiss };
}