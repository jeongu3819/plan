import React from 'react';
import { Box, Paper, Typography, Chip } from '@mui/material';
import { Task } from '../../types';
import { api } from '../../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import QuickAdd from '../../components/QuickAdd';
import TaskCard from '../task/TaskCard';
import {
    DndContext,
    pointerWithin,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    DragStartEvent,
    DragEndEvent,
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface BoardViewProps {
    projectId: number;
}

const COLUMNS: { id: Task['status']; label: string; color: string }[] = [
    { id: 'todo', label: 'To Do', color: '#6B7280' },
    { id: 'in_progress', label: 'In Progress', color: '#2955FF' },
    { id: 'done', label: 'Done', color: '#22C55E' },
    { id: 'hold', label: 'Hold', color: '#F59E0B' },
];

// Sortable task wrapper
const SortableTaskItem = ({ task, onClick }: { task: Task; onClick: () => void }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id, data: { task } });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <TaskCard task={task} onClick={onClick} />
        </div>
    );
};

// Droppable column wrapper
const DroppableColumn = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            style={{
                flexGrow: 1,
                overflowY: 'auto',
                padding: '8px',
                minHeight: 100,
                borderRadius: 8,
                backgroundColor: isOver ? 'rgba(41, 85, 255, 0.04)' : 'transparent',
                transition: 'background-color 0.2s ease',
            }}
        >
            {children}
        </div>
    );
};

const BoardView: React.FC<BoardViewProps> = ({ projectId }) => {
    const { data: tasks, isLoading } = useQuery({
        queryKey: ['tasks', projectId],
        queryFn: () => api.getTasks(projectId),
    });

    const queryClient = useQueryClient();
    const openDrawer = useAppStore((state) => state.openDrawer);
    const [activeTask, setActiveTask] = React.useState<Task | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const updateStatusMutation = useMutation({
        mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
            api.updateTask(taskId, { status: status as Task['status'] }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        },
    });

    const handleDragStart = (event: DragStartEvent) => {
        const task = tasks?.find((t) => t.id === event.active.id);
        if (task) setActiveTask(task);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTask(null);
        if (!over) return;

        const activeId = active.id as number;
        const overId = over.id;

        let newStatus = '';

        // Check if dropped on a column
        if (COLUMNS.some((col) => col.id === overId)) {
            newStatus = overId as string;
        } else {
            // Dropped over another task
            const overTask = tasks?.find((t) => t.id === overId);
            if (overTask) newStatus = overTask.status;
        }

        const draggedTask = tasks?.find((t) => t.id === activeId);
        if (draggedTask && newStatus && draggedTask.status !== newStatus) {
            updateStatusMutation.mutate({ taskId: activeId, status: newStatus });
        }
    };

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', gap: 2, p: 2 }}>
                {COLUMNS.map((col) => (
                    <Paper key={col.id} sx={{ minWidth: 280, height: 400, bgcolor: '#F3F4F6', borderRadius: 2 }} elevation={0} />
                ))}
            </Box>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, height: 'calc(100vh - 180px)' }}>
                {COLUMNS.map((col) => {
                    const colTasks = tasks?.filter((t) => t.status === col.id) || [];

                    return (
                        <Box
                            key={col.id}
                            sx={{
                                minWidth: 300,
                                maxWidth: 340,
                                bgcolor: '#F3F4F6',
                                borderRadius: 2,
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                            }}
                        >
                            {/* Column Header */}
                            <Box sx={{
                                p: 1.5, px: 2,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: col.color }} />
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151' }}>
                                        {col.label}
                                    </Typography>
                                    <Chip
                                        label={colTasks.length}
                                        size="small"
                                        sx={{ height: 20, minWidth: 20, fontSize: '0.7rem', fontWeight: 600, bgcolor: '#E5E7EB', color: '#6B7280' }}
                                    />
                                </Box>
                            </Box>

                            {/* Droppable + Sortable Area */}
                            <SortableContext
                                id={col.id}
                                items={colTasks.map((t) => t.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <DroppableColumn id={col.id}>
                                    {colTasks.length === 0 ? (
                                        <Box sx={{
                                            p: 3, textAlign: 'center', color: '#9CA3AF',
                                            border: '2px dashed #E5E7EB', borderRadius: 2,
                                        }}>
                                            <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                                                Drop tasks here
                                            </Typography>
                                        </Box>
                                    ) : (
                                        colTasks.map((task) => (
                                            <SortableTaskItem
                                                key={task.id}
                                                task={task}
                                                onClick={() => openDrawer(task, projectId)}
                                            />
                                        ))
                                    )}
                                </DroppableColumn>
                            </SortableContext>

                            {/* Quick Add */}
                            <Box sx={{ px: 1, pb: 1 }}>
                                <QuickAdd projectId={projectId} defaultStatus={col.id} />
                            </Box>
                        </Box>
                    );
                })}
            </Box>

            {/* Drag Overlay */}
            <DragOverlay>
                {activeTask ? (
                    <TaskCard
                        task={activeTask}
                        onClick={() => { }}
                        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.15)', transform: 'rotate(3deg)' }}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default BoardView;
