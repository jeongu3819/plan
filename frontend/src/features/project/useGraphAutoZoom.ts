import { useCallback } from 'react';
import { useReactFlow, Node } from 'react-flow-renderer';

export function useGraphAutoZoom() {
  const { fitBounds, fitView } = useReactFlow();

  const zoomToNodes = useCallback(
    (allNodes: Node[], targetIds: Set<string>) => {
      const targets = allNodes.filter(n => targetIds.has(n.id));
      if (targets.length === 0) return;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const n of targets) {
        const w = n.style?.minWidth ? Number(n.style.minWidth) : 200;
        const h = 60;
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + w);
        maxY = Math.max(maxY, n.position.y + h);
      }

      fitBounds(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        { padding: 0.4, duration: 400 }
      );
    },
    [fitBounds]
  );

  const zoomToAll = useCallback(() => {
    fitView({ padding: 0.3, duration: 400 });
  }, [fitView]);

  return { zoomToNodes, zoomToAll };
}
