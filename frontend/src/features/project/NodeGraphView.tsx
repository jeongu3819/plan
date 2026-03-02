import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Paper,
  Chip,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Position,
} from 'react-flow-renderer';
import dagre from 'dagre';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../stores/useAppStore';
import { GraphNode, GraphEdge } from '../../types';

interface NodeGraphViewProps {
  projectId: number;
}

const nodeColors: Record<string, { bg: string; border: string; text: string }> = {
  project: { bg: '#EEF2FF', border: '#2955FF', text: '#1E3A8A' },
  subproject: { bg: '#F5F3FF', border: '#8B5CF6', text: '#5B21B6' },
  task: { bg: '#F0FDF4', border: '#22C55E', text: '#166534' },
  note: { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E' },
  attachment: { bg: '#FEF2F2', border: '#EF4444', text: '#991B1B' },
};

const statusColors: Record<string, string> = {
  todo: '#6B7280',
  in_progress: '#2955FF',
  done: '#22C55E',
  hold: '#F59E0B',
};

// Dagre layout
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: 200, height: 60 });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - 100,
      y: nodeWithPosition.y - 30,
    };
  });

  return { nodes, edges };
};

const NodeGraphView: React.FC<NodeGraphViewProps> = ({ projectId }) => {
  const [filterType, setFilterType] = useState('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const openDrawer = useAppStore(state => state.openDrawer);

  // Subproject creation dialog state
  const [showSubProjectDialog, setShowSubProjectDialog] = useState(false);
  const [newSubProjectName, setNewSubProjectName] = useState('');
  const [newSubProjectDesc, setNewSubProjectDesc] = useState('');
  const [parentSubProjectId, setParentSubProjectId] = useState<number | null>(null);

  // Subproject delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: graphData, isLoading } = useQuery({
    queryKey: ['graph', projectId],
    queryFn: () => api.getProjectGraph(projectId),
    refetchOnWindowFocus: true,
  });

  // Subproject creation mutation
  const createSubProjectMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; parent_id?: number | null }) =>
      api.createSubProject(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph', projectId] });
      setShowSubProjectDialog(false);
      setNewSubProjectName('');
      setNewSubProjectDesc('');
      setParentSubProjectId(null);
    },
  });

  // Subproject deletion mutation
  const deleteSubProjectMutation = useMutation({
    mutationFn: (subId: number) => api.deleteSubProject(subId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['roadmap', projectId] });
      queryClient.invalidateQueries({ queryKey: ['subprojects', projectId] });
      setDeleteTarget(null);
      setSelectedNodeId(null);
    },
  });

  // Available subprojects for parent selection
  const subProjectOptions = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes
      .filter((n: GraphNode) => n.type === 'subproject')
      .map((n: GraphNode) => ({
        id: parseInt(n.id.replace('subproject-', '')),
        label: n.label,
      }));
  }, [graphData]);

  // Find all connected node IDs for the selected node
  const connectedIds = useMemo(() => {
    if (!selectedNodeId || !graphData) return new Set<string>();
    const ids = new Set<string>([selectedNodeId]);
    // BFS: find all nodes connected via edges (both directions)
    const edgeMap = new Map<string, string[]>();
    graphData.edges.forEach(e => {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
      if (!edgeMap.has(e.target)) edgeMap.set(e.target, []);
      edgeMap.get(e.source)!.push(e.target);
      edgeMap.get(e.target)!.push(e.source);
    });
    const queue = [selectedNodeId];
    const visited = new Set<string>([selectedNodeId]);
    // Only traverse 1 level deep for clarity
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = edgeMap.get(current) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          ids.add(n);
        }
      }
    }
    return ids;
  }, [selectedNodeId, graphData]);

  const { nodes, edges } = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };

    let filteredNodes = graphData.nodes;
    let filteredEdges = graphData.edges;

    if (filterType !== 'all') {
      const typeNodes = new Set(filteredNodes.filter(n => n.type === filterType).map(n => n.id));
      filteredNodes.forEach(n => {
        if (n.type === 'project') typeNodes.add(n.id);
      });
      filteredEdges.forEach(e => {
        if (typeNodes.has(e.target)) typeNodes.add(e.source);
      });
      filteredNodes = filteredNodes.filter(n => typeNodes.has(n.id));
      filteredEdges = filteredEdges.filter(e => typeNodes.has(e.source) && typeNodes.has(e.target));
    }

    const hasSelection = selectedNodeId !== null;

    const flowNodes: Node[] = filteredNodes.map((n: GraphNode) => {
      const colors = nodeColors[n.type] || nodeColors.task;
      const isSelected = selectedNodeId === n.id;
      const isConnected = connectedIds.has(n.id);
      const isDimmed = hasSelection && !isConnected;

      return {
        id: n.id,
        data: {
          label: (
            <Box sx={{ textAlign: 'center' }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.55rem',
                  textTransform: 'uppercase',
                  color: colors.text,
                  opacity: isDimmed ? 0.3 : 0.7,
                  display: 'block',
                  mb: 0.3,
                }}
              >
                {n.type}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  color: colors.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 180,
                  opacity: isDimmed ? 0.3 : 1,
                }}
              >
                {n.label}
              </Typography>
              {n.status && (
                <Chip
                  label={n.status}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.55rem',
                    fontWeight: 600,
                    mt: 0.3,
                    bgcolor: `${statusColors[n.status] || '#6B7280'}20`,
                    color: statusColors[n.status] || '#6B7280',
                    opacity: isDimmed ? 0.3 : 1,
                  }}
                />
              )}
            </Box>
          ),
        },
        position: { x: 0, y: 0 },
        style: {
          background: isDimmed ? '#F9FAFB' : colors.bg,
          border: `${isSelected ? 3 : 2}px solid ${isDimmed ? '#E5E7EB' : colors.border}`,
          borderRadius: 12,
          padding: '8px 12px',
          minWidth: 160,
          maxWidth: 220,
          opacity: isDimmed ? 0.35 : 1,
          boxShadow: isSelected
            ? `0 0 0 3px ${colors.border}40, 0 4px 16px ${colors.border}30`
            : isConnected && hasSelection
              ? `0 0 0 2px ${colors.border}25, 0 2px 8px rgba(0,0,0,0.08)`
              : 'none',
          transition: 'all 0.3s ease',
          cursor: 'pointer',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });

    const flowEdges: Edge[] = filteredEdges.map((e: GraphEdge, i: number) => {
      const isHighlighted =
        hasSelection && connectedIds.has(e.source) && connectedIds.has(e.target);
      return {
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        animated: isHighlighted,
        style: {
          stroke: isHighlighted
            ? '#2955FF'
            : isDimmedEdge(e, hasSelection, connectedIds)
              ? '#F3F4F6'
              : '#C7D2FE',
          strokeWidth: isHighlighted ? 3 : 2,
          transition: 'all 0.3s ease',
        },
      };
    });

    return getLayoutedElements(flowNodes, flowEdges);
  }, [graphData, filterType, selectedNodeId, connectedIds]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(prev => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Selected node info
  const selectedInfo = useMemo(() => {
    if (!selectedNodeId || !graphData) return null;
    const node = graphData.nodes.find(n => n.id === selectedNodeId);
    if (!node) return null;
    const connected = graphData.edges.filter(
      e => e.source === selectedNodeId || e.target === selectedNodeId
    );
    return { ...node, connectionCount: connected.length };
  }, [selectedNodeId, graphData]);

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Loading graph...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Filters + Info */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="Filter by Type"
          value={filterType}
          onChange={e => {
            setFilterType(e.target.value);
            setSelectedNodeId(null);
          }}
          sx={{ minWidth: 150, '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="task">Tasks</MenuItem>
          <MenuItem value="subproject">SubProjects</MenuItem>
          <MenuItem value="note">Notes</MenuItem>
          <MenuItem value="attachment">Attachments</MenuItem>
        </TextField>

        {/* Creation buttons */}
        <Tooltip title="Create Subproject">
          <Button
            variant="outlined"
            size="small"
            startIcon={<AccountTreeIcon />}
            onClick={() => setShowSubProjectDialog(true)}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderColor: '#8B5CF6',
              color: '#8B5CF6',
              '&:hover': { borderColor: '#7C3AED', bgcolor: '#F5F3FF' },
            }}
          >
            Subproject
          </Button>
        </Tooltip>
        <Tooltip title="Create Task">
          <Button
            variant="outlined"
            size="small"
            startIcon={<TaskAltIcon />}
            onClick={() => openDrawer(null, projectId)}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderColor: '#22C55E',
              color: '#16A34A',
              '&:hover': { borderColor: '#16A34A', bgcolor: '#F0FDF4' },
            }}
          >
            Task
          </Button>
        </Tooltip>

        {/* Selected node info panel */}
        {selectedInfo && (
          <Paper
            sx={{
              px: 2,
              py: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              borderRadius: 2,
              border: `2px solid ${nodeColors[selectedInfo.type]?.border || '#6B7280'}`,
              bgcolor: nodeColors[selectedInfo.type]?.bg || '#F9FAFB',
              animation: 'fadeIn 0.2s ease',
            }}
            elevation={0}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: nodeColors[selectedInfo.type]?.border || '#6B7280',
              }}
            />
            <Box>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  color: nodeColors[selectedInfo.type]?.text,
                }}
              >
                {selectedInfo.label}
              </Typography>
              <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.65rem' }}>
                {selectedInfo.type.toUpperCase()} · {selectedInfo.connectionCount} connections
                {selectedInfo.status && ` · ${selectedInfo.status}`}
              </Typography>
            </Box>
            <Chip
              label="ESC to deselect"
              size="small"
              onClick={() => setSelectedNodeId(null)}
              sx={{
                fontSize: '0.6rem',
                height: 20,
                cursor: 'pointer',
                bgcolor: '#E5E7EB',
                color: '#6B7280',
                '&:hover': { bgcolor: '#D1D5DB' },
              }}
            />
            {/* Node-specific action buttons */}
            {selectedInfo.type === 'subproject' && (
              <>
                <Tooltip title="Add Task to this Subproject">
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => openDrawer(null, projectId)}
                    sx={{ fontSize: '0.65rem', textTransform: 'none', ml: 0.5 }}
                  >
                    Add Task
                  </Button>
                </Tooltip>
                <Tooltip title="Delete Subproject">
                  <Button
                    size="small"
                    startIcon={<DeleteOutlineIcon />}
                    onClick={() =>
                      setDeleteTarget({ id: selectedInfo.id, label: selectedInfo.label })
                    }
                    sx={{
                      fontSize: '0.65rem',
                      textTransform: 'none',
                      color: '#EF4444',
                      '&:hover': { bgcolor: '#FEF2F2' },
                    }}
                  >
                    Delete
                  </Button>
                </Tooltip>
              </>
            )}
            {selectedInfo.type === 'task' && (
              <Tooltip title="Edit Task">
                <Button
                  size="small"
                  onClick={() => {
                    const taskId = parseInt(selectedNodeId!.replace('task-', ''));
                    openDrawer({ id: taskId } as any, projectId);
                  }}
                  sx={{ fontSize: '0.65rem', textTransform: 'none', ml: 0.5 }}
                >
                  Edit
                </Button>
              </Tooltip>
            )}
          </Paper>
        )}

        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 1.5, ml: 'auto' }}>
          {Object.entries(nodeColors).map(([type, colors]) => (
            <Box
              key={type}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
              onClick={() => setFilterType(filterType === type ? 'all' : type)}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: colors.border,
                  outline: filterType === type ? `2px solid ${colors.border}` : 'none',
                  outlineOffset: 2,
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  color: filterType === type ? colors.text : '#6B7280',
                  textTransform: 'capitalize',
                  fontWeight: filterType === type ? 700 : 400,
                }}
              >
                {type}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Graph */}
      <Paper
        sx={{
          height: 'calc(100vh - 320px)',
          minHeight: 400,
          borderRadius: 2,
          border: '1px solid #E5E7EB',
          overflow: 'hidden',
        }}
        elevation={0}
      >
        {nodes.length === 0 ? (
          <Box
            sx={{
              p: 6,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="body2" color="textSecondary">
              No data to visualize. Add tasks, notes, or sub-projects first.
            </Typography>
          </Box>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#E5E7EB" gap={16} />
            <Controls />
            <MiniMap
              nodeStrokeColor={(n: any) => {
                const type = n.id?.split('-')[0] || 'task';
                return nodeColors[type]?.border || '#6B7280';
              }}
              nodeColor={(n: any) => {
                const type = n.id?.split('-')[0] || 'task';
                return nodeColors[type]?.bg || '#F0FDF4';
              }}
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        )}
      </Paper>

      {/* Subproject Creation Dialog */}
      <Dialog
        open={showSubProjectDialog}
        onClose={() => setShowSubProjectDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountTreeIcon sx={{ color: '#8B5CF6' }} />
            Create Subproject
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <TextField
            label="Name"
            size="small"
            value={newSubProjectName}
            onChange={e => setNewSubProjectName(e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            label="Description"
            size="small"
            value={newSubProjectDesc}
            onChange={e => setNewSubProjectDesc(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            select
            label="Parent Subproject (optional)"
            size="small"
            value={parentSubProjectId ?? ''}
            onChange={e => setParentSubProjectId(e.target.value ? Number(e.target.value) : null)}
            fullWidth
          >
            <MenuItem value="">None (directly under Project)</MenuItem>
            {subProjectOptions.map(sp => (
              <MenuItem key={sp.id} value={sp.id}>
                {sp.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setShowSubProjectDialog(false);
              setNewSubProjectName('');
              setNewSubProjectDesc('');
              setParentSubProjectId(null);
            }}
            sx={{ textTransform: 'none', color: '#6B7280' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!newSubProjectName.trim() || createSubProjectMutation.isPending}
            onClick={() => {
              createSubProjectMutation.mutate({
                name: newSubProjectName.trim(),
                description: newSubProjectDesc.trim() || undefined,
                parent_id: parentSubProjectId,
              });
            }}
            sx={{
              textTransform: 'none',
              bgcolor: '#8B5CF6',
              '&:hover': { bgcolor: '#7C3AED' },
            }}
          >
            {createSubProjectMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subproject Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#EF4444' }}>
          Subproject 삭제
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#374151', fontSize: '0.9rem' }}>
            <strong>"{deleteTarget?.label}"</strong> 을(를) 삭제하시겠습니까?
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.85rem', mt: 1 }}>
            하위 Task는 삭제되지 않고 프로젝트 직속으로 이동됩니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            sx={{ textTransform: 'none', color: '#6B7280' }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (deleteTarget) {
                const numericId = parseInt(deleteTarget.id.replace('subproject-', ''), 10);
                deleteSubProjectMutation.mutate(numericId);
              }
            }}
            disabled={deleteSubProjectMutation.isPending}
            sx={{
              textTransform: 'none',
              bgcolor: '#EF4444',
              '&:hover': { bgcolor: '#DC2626' },
            }}
          >
            {deleteSubProjectMutation.isPending ? '삭제 중...' : '삭제'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Helper to check if an edge should be dimmed
function isDimmedEdge(e: GraphEdge, hasSelection: boolean, connectedIds: Set<string>): boolean {
  if (!hasSelection) return false;
  return !(connectedIds.has(e.source) && connectedIds.has(e.target));
}

export default NodeGraphView;
