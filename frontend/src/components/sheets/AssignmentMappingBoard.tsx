/**
 * AssignmentMappingBoard — chemical_check_sheet 같은 "master → entity" 매핑 편집 보드.
 *   - 각 master(약품)별로 그룹 카드
 *   - 각 그룹 안에 entity(설비) 카드들
 *   - 설비를 다른 약품으로 이동 / 새 설비 추가 / 삭제 / 담당자·비고 편집
 *
 * 이동 UX: 카드 오른쪽 "이동" 버튼 → 다른 master 선택 드롭다운 (클릭 기반; 드래그 없음)
 *   ※ 드래그는 추후 @dnd-kit로 확장 가능. 우선 안정성 높은 클릭-이동 구현.
 */
import { useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Button, IconButton, Chip, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Menu, MenuItem, Divider, Tooltip, alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { SheetExecutionMapping } from '../../types';

interface Props {
  executionId: number;
  mappings: SheetExecutionMapping[];
  userId: number;
  readOnly?: boolean;
}

export default function AssignmentMappingBoard({ executionId, mappings, userId, readOnly }: Props) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sheetExecution', String(executionId)] });

  // master_name별 그룹
  const groups = useMemo(() => {
    const map = new Map<string, SheetExecutionMapping[]>();
    (mappings || []).forEach(m => {
      const key = m.master_name || '(미분류)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mappings]);

  const masterNames = useMemo(() => groups.map(([n]) => n), [groups]);

  const updateM = useMutation({
    mutationFn: (args: { mappingId: number; body: { master_name?: string; assigned_entity?: string; manager?: string; note?: string } }) =>
      api.updateSheetMapping(executionId, args.mappingId, args.body, userId),
    onSuccess: invalidate,
  });
  const deleteM = useMutation({
    mutationFn: (mappingId: number) => api.deleteSheetMapping(executionId, mappingId, userId),
    onSuccess: invalidate,
  });
  const addM = useMutation({
    mutationFn: (body: { master_name: string; assigned_entity: string }) => api.addSheetMapping(executionId, body, userId),
    onSuccess: invalidate,
  });

  const [moveMenu, setMoveMenu] = useState<{ anchor: HTMLElement; mapping: SheetExecutionMapping } | null>(null);
  const [editDlg, setEditDlg] = useState<SheetExecutionMapping | null>(null);
  const [addDlg, setAddDlg] = useState<{ master: string } | null>(null);
  const [newEntity, setNewEntity] = useState('');
  const [newGroupDlg, setNewGroupDlg] = useState(false);
  const [newMaster, setNewMaster] = useState('');
  const [newMasterEntity, setNewMasterEntity] = useState('');

  const [editMaster, setEditMaster] = useState('');
  const [editEntity, setEditEntity] = useState('');
  const [editManager, setEditManager] = useState('');
  const [editNote, setEditNote] = useState('');

  const openEdit = (m: SheetExecutionMapping) => {
    setEditDlg(m);
    setEditMaster(m.master_name || '');
    setEditEntity(m.assigned_entity || '');
    setEditManager(m.manager || '');
    setEditNote(m.note || '');
  };
  const saveEdit = () => {
    if (!editDlg) return;
    updateM.mutate({
      mappingId: editDlg.id,
      body: {
        master_name: editMaster !== editDlg.master_name ? editMaster : undefined,
        assigned_entity: editEntity !== editDlg.assigned_entity ? editEntity : undefined,
        manager: editManager !== (editDlg.manager || '') ? editManager : undefined,
        note: editNote !== (editDlg.note || '') ? editNote : undefined,
      },
    });
    setEditDlg(null);
  };

  const moveTo = (targetMaster: string) => {
    if (!moveMenu) return;
    if (targetMaster !== moveMenu.mapping.master_name) {
      updateM.mutate({ mappingId: moveMenu.mapping.id, body: { master_name: targetMaster } });
    }
    setMoveMenu(null);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          배정 매핑 ({mappings.length}개)
        </Typography>
        {!readOnly && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={() => { setNewGroupDlg(true); setNewMaster(''); setNewMasterEntity(''); }}
            sx={{ fontSize: '0.72rem' }}
          >
            새 그룹 추가
          </Button>
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 1.5,
        }}
      >
        {groups.map(([master, items]) => (
          <Paper
            key={master}
            variant="outlined"
            sx={{ p: 1.5, borderRadius: 2, bgcolor: '#FAFBFC', display: 'flex', flexDirection: 'column', minHeight: 180 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.82rem' }}>
                {master}
              </Typography>
              <Chip
                label={items.length}
                size="small"
                sx={{ height: 18, fontSize: '0.62rem', bgcolor: alpha('#2955FF', 0.1), color: '#2955FF', fontWeight: 700 }}
              />
            </Box>
            <Divider sx={{ mb: 1 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, flex: 1 }}>
              {items.map(m => (
                <Paper
                  key={m.id}
                  variant="outlined"
                  sx={{
                    p: 0.8, borderRadius: 1.5, bgcolor: '#fff',
                    display: 'flex', alignItems: 'center', gap: 0.5,
                    '&:hover': { borderColor: '#2955FF' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.assigned_entity || '(미지정)'}
                    </Typography>
                    {(m.manager || m.note) && (
                      <Typography variant="caption" sx={{ fontSize: '0.64rem', color: '#6B7280', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.manager ? `담당: ${m.manager}` : ''}
                        {m.manager && m.note ? ' · ' : ''}
                        {m.note || ''}
                      </Typography>
                    )}
                  </Box>

                  {!readOnly && (
                    <>
                      <Tooltip title="다른 그룹으로 이동">
                        <IconButton
                          size="small"
                          onClick={(e) => setMoveMenu({ anchor: e.currentTarget, mapping: m })}
                          sx={{ p: 0.3 }}
                        >
                          <SwapHorizIcon sx={{ fontSize: 16, color: '#6B7280' }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="편집">
                        <IconButton size="small" onClick={() => openEdit(m)} sx={{ p: 0.3 }}>
                          <EditIcon sx={{ fontSize: 15, color: '#6B7280' }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="삭제">
                        <IconButton
                          size="small"
                          onClick={() => {
                            if (confirm(`[${m.assigned_entity}]를 [${master}]에서 삭제할까요?`)) {
                              deleteM.mutate(m.id);
                            }
                          }}
                          sx={{ p: 0.3 }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 15, color: '#DC2626' }} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Paper>
              ))}
              {items.length === 0 && (
                <Typography variant="caption" sx={{ fontSize: '0.68rem', color: '#9CA3AF', textAlign: 'center', py: 1 }}>
                  배정된 항목 없음
                </Typography>
              )}
            </Box>

            {!readOnly && (
              <Button
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                onClick={() => { setAddDlg({ master }); setNewEntity(''); }}
                sx={{ fontSize: '0.68rem', mt: 1, color: '#6B7280', justifyContent: 'flex-start' }}
              >
                항목 추가
              </Button>
            )}
          </Paper>
        ))}
        {groups.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 4 }}>
            매핑이 없습니다. 새 그룹을 추가해주세요.
          </Typography>
        )}
      </Box>

      {/* 이동 메뉴 */}
      <Menu
        anchorEl={moveMenu?.anchor}
        open={!!moveMenu}
        onClose={() => setMoveMenu(null)}
      >
        {masterNames.map(name => (
          <MenuItem
            key={name}
            disabled={name === moveMenu?.mapping.master_name}
            onClick={() => moveTo(name)}
            sx={{ fontSize: '0.8rem' }}
          >
            {name}
          </MenuItem>
        ))}
      </Menu>

      {/* 편집 다이얼로그 */}
      <Dialog open={!!editDlg} onClose={() => setEditDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 700 }}>매핑 편집</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
          <TextField size="small" label="그룹(마스터)" value={editMaster} onChange={e => setEditMaster(e.target.value)} fullWidth />
          <TextField size="small" label="항목(배정 대상)" value={editEntity} onChange={e => setEditEntity(e.target.value)} fullWidth />
          <TextField size="small" label="담당자" value={editManager} onChange={e => setEditManager(e.target.value)} fullWidth />
          <TextField size="small" label="비고" value={editNote} onChange={e => setEditNote(e.target.value)} multiline rows={2} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDlg(null)}>취소</Button>
          <Button variant="contained" onClick={saveEdit}>저장</Button>
        </DialogActions>
      </Dialog>

      {/* 항목 추가 다이얼로그 */}
      <Dialog open={!!addDlg} onClose={() => setAddDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
          [{addDlg?.master}]에 항목 추가
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            size="small"
            label="항목명"
            value={newEntity}
            onChange={e => setNewEntity(e.target.value)}
            fullWidth autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && newEntity.trim() && addDlg) {
                addM.mutate({ master_name: addDlg.master, assigned_entity: newEntity.trim() });
                setAddDlg(null);
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDlg(null)}>취소</Button>
          <Button
            variant="contained"
            disabled={!newEntity.trim()}
            onClick={() => {
              if (addDlg && newEntity.trim()) {
                addM.mutate({ master_name: addDlg.master, assigned_entity: newEntity.trim() });
                setAddDlg(null);
              }
            }}
          >
            추가
          </Button>
        </DialogActions>
      </Dialog>

      {/* 새 그룹 추가 */}
      <Dialog open={newGroupDlg} onClose={() => setNewGroupDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 700 }}>새 그룹 추가</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
          <TextField size="small" label="그룹(마스터)명" value={newMaster} onChange={e => setNewMaster(e.target.value)} fullWidth autoFocus />
          <TextField size="small" label="첫 항목명" value={newMasterEntity} onChange={e => setNewMasterEntity(e.target.value)} fullWidth />
          <Typography variant="caption" color="text.secondary">
            그룹을 만들려면 첫 항목이 1개 이상 필요합니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewGroupDlg(false)}>취소</Button>
          <Button
            variant="contained"
            disabled={!newMaster.trim() || !newMasterEntity.trim()}
            onClick={() => {
              if (newMaster.trim() && newMasterEntity.trim()) {
                addM.mutate({ master_name: newMaster.trim(), assigned_entity: newMasterEntity.trim() });
                setNewGroupDlg(false);
              }
            }}
          >
            생성
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
