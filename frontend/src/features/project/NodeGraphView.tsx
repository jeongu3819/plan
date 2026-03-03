import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
  Snackbar,
  Alert,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Position,
  NodeDragHandler,
  useNodesState,
  useEdgesState,
} from 'react-flow-renderer';
import dagre from 'dagre';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../stores/useAppStore';
import { GraphNode, GraphEdge } from '../../types';
import { useGraphAutoZoom } from './useGraphAutoZoom';
import { useGraphDragPreview } from './useGraphDragPreview';
import GraphDragOverlay from './GraphDragOverlay';

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

  // A-2: Auto zoom hook
  const { zoomToNodes, zoomToAll } = useGraphAutoZoom();

  // A-3: Drag ghost preview
  const { isDragging, dragPos, handleDragStart, handleDrag, handleDragEnd } = useGraphDragPreview();

  // Subproject creation dialog state
  const [showSubProjectDialog, setShowSubProjectDialog] = useState(false);
  const [newSubProjectName, setNewSubProjectName] = useState('');
  const [newSubProjectDesc, setNewSubProjectDesc] = useState('');
  const [parentSubProjectId, setParentSubProjectId] = useState<number | null>(null);

  // Subproject delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  // Subproject edit dialog state
  const [editSubProject, setEditSubProject] = useState<{ id: number; name: string; description: string } | null>(null);

  // Task edit dialog state
  const [editTask, setEditTask] = useState<{ id: number; title: string; description: string } | null>(null);

  // v1.2: Drag-insert state & feedback
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const [dragHighlight, setDragHighlight] = useState<string | null>(null); // node id to glow during drag

  const currentUserId = useAppStore(state => state.currentUserId);

  const { data: graphData, isLoading } = useQuery({
    queryKey: ['graph', projectId],
    queryFn: () => api.getProjectGraph(projectId),
    refetchOnWindowFocus: true,
  });

  // SubProject/Task data for edit dialogs
  const { data: subProjectsList = [] } = useQuery({
    queryKey: ['subprojects', projectId],
    queryFn: () => api.getSubProjects(projectId),
  });

  const { data: tasksList = [] } = useQuery({
    queryKey: ['tasks', projectId, currentUserId],
    queryFn: () => api.getTasks(projectId, currentUserId),
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

  // Subproject update mutation
  const updateSubProjectMutation = useMutation({
    mutationFn: (data: { id: number; name: string; description?: string }) =>
      api.updateSubProject(data.id, { name: data.name, description: data.description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph', projectId] });
      queryClient.invalidateQueries({ queryKey: ['subprojects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['roadmap', projectId] });
      setEditSubProject(null);
    },
  });

  // Task update mutation (title/description from graph)
  const updateTaskMutation = useMutation({
    mutationFn: (data: { id: number; title: string; description?: string }) =>
      api.updateTask(data.id, { title: data.title, description: data.description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setEditTask(null);
    },
  });

  // v1.2: Mutation for reassigning a task's sub_project_id (drag-insert)
  const reassignTaskMutation = useMutation({
    mutationFn: ({ taskId, subProjectId }: { taskId: number; subProjectId: number | null }) =>
      api.updateTask(taskId, { sub_project_id: subProjectId } as any),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['graph', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['roadmap', projectId] });
      queryClient.invalidateQueries({ queryKey: ['globalRoadmap'] });
      if (vars.subProjectId === null) {
        setSnackMsg('Task가 프로젝트 직속으로 이동되었습니다');
      } else {
        const spNode = graphData?.nodes.find((n: GraphNode) => n.id === `subproject-${vars.subProjectId}`);
        setSnackMsg(`Task → "${spNode?.label || 'Subproject'}" 하위로 이동되었습니다`);
      }
    },
    onError: () => {
      setSnackMsg('Task 이동에 실패했습니다');
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
    const maxDepth = 1;
    const queue: { id: string; depth: number }[] = [{ id: selectedNodeId, depth: 0 }];
    const visited = new Set<string>([selectedNodeId]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const neighbors = edgeMap.get(current.id) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          ids.add(n);
          queue.push({ id: n, depth: current.depth + 1 });
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
                  fontSize: '0.65rem',
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
                  fontSize: '0.85rem',
                  color: colors.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 200,
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
                    height: 18,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    mt: 0.4,
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
        draggable: n.type !== 'project',
        style: {
          background: isDimmed ? '#F9FAFB' : colors.bg,
          border: `${isSelected ? 3 : dragHighlight === n.id ? 3 : 2}px solid ${isDimmed ? '#E5E7EB' : dragHighlight === n.id ? '#2955FF' : colors.border}`,
          borderRadius: 12,
          padding: '8px 12px',
          minWidth: 160,
          maxWidth: 220,
          opacity: isDimmed ? 0.35 : 1,
          boxShadow: dragHighlight === n.id
            ? '0 0 0 4px rgba(41,85,255,0.3), 0 4px 20px rgba(41,85,255,0.25)'
            : isSelected
              ? `0 0 0 3px ${colors.border}40, 0 4px 16px ${colors.border}30`
              : isConnected && hasSelection
                ? `0 0 0 2px ${colors.border}25, 0 2px 8px rgba(0,0,0,0.08)`
                : 'none',
          transition: 'box-shadow 0.2s, border 0.2s, opacity 0.3s',
          cursor: n.type === 'project' ? 'pointer' : 'grab',
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
              ? '#D1D5DB'
              : '#6B7FD7',
          strokeWidth: isHighlighted ? 3 : 2,
          opacity: isDimmedEdge(e, hasSelection, connectedIds) ? 0.4 : 1,
          transition: 'all 0.3s ease',
        },
      };
    });

    return getLayoutedElements(flowNodes, flowEdges);
  }, [graphData, filterType, selectedNodeId, connectedIds, dragHighlight]);

  // Use interactive node/edge state so dragging moves nodes in real-time
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([]);

  // Sync layout → interactive state whenever layout recalculates
  useEffect(() => {
    setFlowNodes(nodes);
    setFlowEdges(edges);
  }, [nodes, edges, setFlowNodes, setFlowEdges]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(prev => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // A-2: Auto zoom on selection change (debounced, flowNodes excluded from deps)
  const flowNodesRef = useRef<Node[]>([]);
  useEffect(() => { flowNodesRef.current = flowNodes; }, [flowNodes]);

  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => {
      const nodes = flowNodesRef.current;
      if (selectedNodeId && connectedIds.size > 0 && nodes.length > 0) {
        zoomToNodes(nodes, connectedIds);
      } else if (!selectedNodeId && nodes.length > 0) {
        zoomToAll();
      }
    }, 80);
    return () => { if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current); };
  }, [selectedNodeId, connectedIds, zoomToNodes, zoomToAll]);

  // v1.2: Find closest drop target during drag for visual highlight
  const onNodeDrag: NodeDragHandler = useCallback(
    (_event, draggedNode) => {
      if (!graphData) return;
      const dragX = draggedNode.position.x + 100;
      const dragY = draggedNode.position.y + 30;

      if (draggedNode.id.startsWith('task-')) {
        // Task is being dragged → highlight nearest subproject or project node
        let bestId: string | null = null;
        let bestDist = 150;
        for (const node of flowNodes) {
          if (node.id === draggedNode.id) continue;
          if (!node.id.startsWith('subproject-') && !node.id.startsWith('project-')) continue;
          const nx = node.position.x + 100;
          const ny = node.position.y + 30;
          const dist = Math.sqrt((dragX - nx) ** 2 + (dragY - ny) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            bestId = node.id;
          }
        }
        setDragHighlight(bestId);
      } else if (draggedNode.id.startsWith('subproject-')) {
        // Subproject is being dragged → highlight nearest task node connected to project directly
        let bestId: string | null = null;
        let bestDist = 150;
        for (const edge of graphData.edges) {
          if (!edge.source.startsWith('project-') || !edge.target.startsWith('task-')) continue;
          const targetNode = flowNodes.find(n => n.id === edge.target);
          if (!targetNode) continue;
          const nx = targetNode.position.x + 100;
          const ny = targetNode.position.y + 30;
          const dist = Math.sqrt((dragX - nx) ** 2 + (dragY - ny) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            bestId = edge.target;
          }
        }
        setDragHighlight(bestId);
      }
    },
    [graphData, flowNodes]
  );

  // v1.2: Handle drop — reassign task↔subproject
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_event, draggedNode) => {
      setDragHighlight(null);
      if (!graphData) return;

      const dragX = draggedNode.position.x + 100;
      const dragY = draggedNode.position.y + 30;

      // ── CASE 1: Task dropped onto/near a subproject → assign ──
      if (draggedNode.id.startsWith('task-')) {
        const taskId = parseInt(draggedNode.id.replace('task-', ''), 10);
        let bestTarget: { id: string; dist: number } | null = null;

        for (const node of flowNodes) {
          if (node.id === draggedNode.id) continue;
          if (!node.id.startsWith('subproject-') && !node.id.startsWith('project-')) continue;
          const nx = node.position.x + 100;
          const ny = node.position.y + 30;
          const dist = Math.sqrt((dragX - nx) ** 2 + (dragY - ny) ** 2);
          if (dist < 150 && (!bestTarget || dist < bestTarget.dist)) {
            bestTarget = { id: node.id, dist };
          }
        }

        if (bestTarget) {
          if (bestTarget.id.startsWith('subproject-')) {
            const subProjectId = parseInt(bestTarget.id.replace('subproject-', ''), 10);
            // Check if task is already under this subproject
            const currentEdge = graphData.edges.find(e => e.target === draggedNode.id);
            if (currentEdge?.source !== bestTarget.id) {
              reassignTaskMutation.mutate({ taskId, subProjectId });
            }
          } else if (bestTarget.id.startsWith('project-')) {
            // Dropped near project → unassign from subproject (set sub_project_id = null)
            const currentEdge = graphData.edges.find(e => e.target === draggedNode.id);
            if (currentEdge?.source.startsWith('subproject-')) {
              reassignTaskMutation.mutate({ taskId, subProjectId: null as any });
            }
          }
        }
        return;
      }

      // ── CASE 2: Subproject dropped near a direct project→task edge → assign task ──
      if (draggedNode.id.startsWith('subproject-')) {
        const subProjectId = parseInt(draggedNode.id.replace('subproject-', ''), 10);
        let bestTask: { taskId: number; dist: number } | null = null;

        for (const edge of graphData.edges) {
          if (!edge.source.startsWith('project-') || !edge.target.startsWith('task-')) continue;
          const targetNode = flowNodes.find(n => n.id === edge.target);
          if (!targetNode) continue;
          const nx = targetNode.position.x + 100;
          const ny = targetNode.position.y + 30;
          const dist = Math.sqrt((dragX - nx) ** 2 + (dragY - ny) ** 2);
          if (dist < 150 && (!bestTask || dist < bestTask.dist)) {
            bestTask = { taskId: parseInt(edge.target.replace('task-', ''), 10), dist };
          }
        }

        if (bestTask) {
          reassignTaskMutation.mutate({ taskId: bestTask.taskId, subProjectId });
        }
      }
    },
    [graphData, flowNodes, reassignTaskMutation]
  );

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
        <Tooltip title="Create Subproject (drag onto graph to place)">
          <Button
            variant="outlined"
            size="small"
            startIcon={<AccountTreeIcon />}
            onClick={() => setShowSubProjectDialog(true)}
            draggable
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
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
                <Tooltip title="Edit Subproject">
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      const spId = parseInt(selectedInfo.id.replace('subproject-', ''));
                      const sp = subProjectsList.find((s: any) => s.id === spId);
                      setEditSubProject({
                        id: spId,
                        name: sp?.name || selectedInfo.label,
                        description: sp?.description || '',
                      });
                    }}
                    sx={{ fontSize: '0.65rem', textTransform: 'none', ml: 0.5 }}
                  >
                    Edit
                  </Button>
                </Tooltip>
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
              <>
                <Tooltip title="Edit Task">
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      const taskId = parseInt(selectedNodeId!.replace('task-', ''));
                      const task = tasksList.find((t: any) => t.id === taskId);
                      setEditTask({
                        id: taskId,
                        title: task?.title || selectedInfo.label,
                        description: task?.description || '',
                      });
                    }}
                    sx={{ fontSize: '0.65rem', textTransform: 'none', ml: 0.5 }}
                  >
                    Edit
                  </Button>
                </Tooltip>
                <Tooltip title="Open Full Editor">
                  <Button
                    size="small"
                    onClick={() => {
                      const taskId = parseInt(selectedNodeId!.replace('task-', ''));
                      const task = tasksList.find((t: any) => t.id === taskId);
                      openDrawer(task || { id: taskId } as any, projectId);
                    }}
                    sx={{ fontSize: '0.65rem', textTransform: 'none', color: '#6B7280' }}
                  >
                    Detail
                  </Button>
                </Tooltip>
              </>
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
          height: 'calc(100vh - 240px)',
          minHeight: 500,
          borderRadius: 3,
          bgcolor: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 2px 16px rgba(0, 0, 0, 0.03)',
          overflow: 'hidden',
          '& .react-flow__background': {
            opacity: 0.5,
          },
        }}
        elevation={0}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/create-subproject')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer.getData('application/create-subproject')) {
            e.preventDefault();
            setShowSubProjectDialog(true);
          }
        }}
      >
        {flowNodes.length === 0 ? (
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
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            fitView
            minZoom={0.3}
            maxZoom={2}
            attributionPosition="bottom-left"
          >
            <Background color="rgba(0, 0, 0, 0.04)" gap={24} size={1} />
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

      {/* Subproject Edit Dialog */}
      <Dialog
        open={!!editSubProject}
        onClose={() => setEditSubProject(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountTreeIcon sx={{ color: '#8B5CF6' }} />
            Subproject 수정
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <TextField
            label="이름"
            size="small"
            value={editSubProject?.name || ''}
            onChange={e =>
              setEditSubProject(prev => prev ? { ...prev, name: e.target.value } : null)
            }
            fullWidth
            autoFocus
          />
          <TextField
            label="설명"
            size="small"
            value={editSubProject?.description || ''}
            onChange={e =>
              setEditSubProject(prev => prev ? { ...prev, description: e.target.value } : null)
            }
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setEditSubProject(null)}
            sx={{ textTransform: 'none', color: '#6B7280' }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            disabled={!editSubProject?.name?.trim() || updateSubProjectMutation.isPending}
            onClick={() => {
              if (editSubProject) {
                updateSubProjectMutation.mutate({
                  id: editSubProject.id,
                  name: editSubProject.name.trim(),
                  description: editSubProject.description.trim() || undefined,
                });
              }
            }}
            sx={{
              textTransform: 'none',
              bgcolor: '#8B5CF6',
              '&:hover': { bgcolor: '#7C3AED' },
            }}
          >
            {updateSubProjectMutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Task Edit Dialog */}
      <Dialog
        open={!!editTask}
        onClose={() => setEditTask(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TaskAltIcon sx={{ color: '#22C55E' }} />
            Task 수정
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <TextField
            label="제목"
            size="small"
            value={editTask?.title || ''}
            onChange={e =>
              setEditTask(prev => prev ? { ...prev, title: e.target.value } : null)
            }
            fullWidth
            autoFocus
          />
          <TextField
            label="설명"
            size="small"
            value={editTask?.description || ''}
            onChange={e =>
              setEditTask(prev => prev ? { ...prev, description: e.target.value } : null)
            }
            fullWidth
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setEditTask(null)}
            sx={{ textTransform: 'none', color: '#6B7280' }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            disabled={!editTask?.title?.trim() || updateTaskMutation.isPending}
            onClick={() => {
              if (editTask) {
                updateTaskMutation.mutate({
                  id: editTask.id,
                  title: editTask.title.trim(),
                  description: editTask.description.trim() || undefined,
                });
              }
            }}
            sx={{
              textTransform: 'none',
              bgcolor: '#22C55E',
              '&:hover': { bgcolor: '#16A34A' },
            }}
          >
            {updateTaskMutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* A-3: Drag ghost preview */}
      <GraphDragOverlay visible={isDragging} x={dragPos.x} y={dragPos.y} />

      {/* v1.2: Drag-insert feedback snackbar */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackMsg(null)}
          severity={snackMsg?.includes('실패') ? 'error' : 'success'}
          sx={{ width: '100%' }}
        >
          {snackMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

// Helper to check if an edge should be dimmed
function isDimmedEdge(e: GraphEdge, hasSelection: boolean, connectedIds: Set<string>): boolean {
  if (!hasSelection) return false;
  return !(connectedIds.has(e.source) && connectedIds.has(e.target));
}

export default NodeGraphView;
