import { useCallback, useEffect, useRef, useState } from 'react';

interface UseMenuKeyboardOptions {
  isOpen: boolean;
  onClose: () => void;
  itemCount: number;
  triggerRef?: React.RefObject<HTMLElement | null>;
  orientation?: 'vertical' | 'horizontal' | 'grid';
  gridCols?: number;
}

export function useMenuKeyboard({
  isOpen,
  onClose,
  itemCount,
  triggerRef,
  orientation = 'vertical',
  gridCols = 1,
}: UseMenuKeyboardOptions) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Reset active index when opened
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    } else {
      setActiveIndex(-1);
    }
  }, [isOpen]);

  // Restore focus to trigger when closing
  const closeAndRestore = useCallback(() => {
    onClose();
    if (triggerRef?.current) {
      setTimeout(() => {
        triggerRef.current?.focus();
      }, 10);
    }
  }, [onClose, triggerRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeAndRestore();
        return;
      }

      if (itemCount === 0) return;

      if (orientation === 'vertical') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1 >= itemCount ? 0 : prev + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 < 0 ? itemCount - 1 : prev - 1));
        } else if (e.key === 'Home') {
          e.preventDefault();
          setActiveIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setActiveIndex(itemCount - 1);
        }
      } else if (orientation === 'horizontal') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1 >= itemCount ? 0 : prev + 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 < 0 ? itemCount - 1 : prev - 1));
        } else if (e.key === 'Home') {
          e.preventDefault();
          setActiveIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setActiveIndex(itemCount - 1);
        }
      } else if (orientation === 'grid') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1 >= itemCount ? 0 : prev + 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 < 0 ? itemCount - 1 : prev - 1));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((prev) => {
            const next = prev + gridCols;
            return next >= itemCount ? prev % gridCols : next;
          });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((prev) => {
            const next = prev - gridCols;
            return next < 0 ? prev : next;
          });
        } else if (e.key === 'Home') {
          e.preventDefault();
          setActiveIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setActiveIndex(itemCount - 1);
        }
      }
    },
    [isOpen, itemCount, orientation, gridCols, closeAndRestore]
  );

  return {
    activeIndex,
    setActiveIndex,
    menuRef,
    handleKeyDown,
    closeAndRestore,
  };
}
