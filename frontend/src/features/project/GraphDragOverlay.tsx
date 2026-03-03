import React from 'react';
import { Box, Typography } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';

interface GraphDragOverlayProps {
  visible: boolean;
  x: number;
  y: number;
}

const GraphDragOverlay: React.FC<GraphDragOverlayProps> = ({ visible, x, y }) => {
  if (!visible || (x === 0 && y === 0)) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        left: x + 12,
        top: y + 12,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: 0.7,
        background: '#F5F3FF',
        border: '2px dashed #8B5CF6',
        borderRadius: 2,
        px: 2,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
      }}
    >
      <AccountTreeIcon sx={{ color: '#8B5CF6', fontSize: 18 }} />
      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#5B21B6' }}>
        New Subproject
      </Typography>
    </Box>
  );
};

export default GraphDragOverlay;
