import { useState, useCallback } from 'react';

export function useGraphDragPreview() {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/create-subproject', 'true');
    e.dataTransfer.effectAllowed = 'copy';
    // Use a transparent 1x1 pixel as drag image so we can show custom ghost
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
    setIsDragging(true);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    if (e.clientX === 0 && e.clientY === 0) return; // ignore ghost events
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return { isDragging, dragPos, handleDragStart, handleDrag, handleDragEnd };
}
