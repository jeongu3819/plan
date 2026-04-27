/**
 * ImagePreviewModal — 작업노트 이미지를 큰 화면에서 확대/축소해 볼 수 있는 라이트박스.
 * - +/- 버튼, 마우스 휠로 zoom
 * - 100% 리셋
 * - ESC 또는 X로 닫기 (Dialog 기본 동작 활용)
 */
import { useState, useEffect, useCallback } from 'react';
import { Dialog, IconButton, Box, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

interface Props {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

const ImagePreviewModal: React.FC<Props> = ({ src, alt, onClose }) => {
  const [zoom, setZoom] = useState(1);

  // 새 이미지가 열리면 배율 초기화
  useEffect(() => {
    if (src) setZoom(1);
  }, [src]);

  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  }, []);
  const reset = useCallback(() => setZoom(1), []);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  return (
    <Dialog
      open={!!src}
      onClose={onClose}
      maxWidth={false}
      fullScreen
      PaperProps={{ sx: { bgcolor: 'rgba(0,0,0,0.92)' } }}
    >
      {/* Toolbar */}
      <Box sx={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', alignItems: 'center', gap: 0.5,
        px: 1, py: 0.5, borderRadius: 999, bgcolor: 'rgba(30,30,30,0.85)',
        backdropFilter: 'blur(6px)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}>
        <Tooltip title="축소 (휠 ↓)" arrow>
          <span>
            <IconButton size="small" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}
              sx={{ color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" sx={{
          color: '#fff', minWidth: 48, textAlign: 'center',
          fontWeight: 700, fontSize: '0.75rem',
        }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="확대 (휠 ↑)" arrow>
          <span>
            <IconButton size="small" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}
              sx={{ color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ width: 1, height: 18, bgcolor: 'rgba(255,255,255,0.2)', mx: 0.5 }} />
        <Tooltip title="100% (원본 크기)" arrow>
          <IconButton size="small" onClick={reset} sx={{ color: '#fff' }}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Close button */}
      <IconButton
        onClick={onClose}
        sx={{
          position: 'fixed', top: 12, right: 12, zIndex: 10,
          color: '#fff', bgcolor: 'rgba(30,30,30,0.85)',
          '&:hover': { bgcolor: 'rgba(60,60,60,0.95)' },
        }}
      >
        <CloseIcon />
      </IconButton>

      {/* Image area */}
      <Box
        onClick={(e) => {
          // 이미지 외부 클릭 시 닫기
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={handleWheel}
        sx={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'auto', p: 4, cursor: 'zoom-out',
        }}
      >
        {src && (
          <img
            src={src}
            alt={alt || ''}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 'none',
              maxHeight: 'none',
              width: `${zoom * 100}%`,
              height: 'auto',
              transition: 'width 0.15s ease',
              cursor: 'default',
              boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
            }}
            draggable={false}
          />
        )}
      </Box>
    </Dialog>
  );
};

export default ImagePreviewModal;
