import React, { useState } from 'react';
import { Box, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Task } from '../types';
import AddIcon from '@mui/icons-material/Add';

interface QuickAddProps {
    projectId: number;
    defaultStatus?: Task['status'];
    onSuccess?: () => void;
}

const QuickAdd: React.FC<QuickAddProps> = ({ projectId, defaultStatus = 'todo', onSuccess }) => {
    const [title, setTitle] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const queryClient = useQueryClient();

    const createMutation = useMutation({
        mutationFn: (newTask: Omit<Task, 'id'>) => api.createTask(newTask),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            setTitle('');
            if (onSuccess) onSuccess();
        },
    });

    const handleSubmit = () => {
        if (title.trim()) {
            createMutation.mutate({
                title: title.trim(),
                project_id: projectId,
                status: defaultStatus,
                assignee_ids: [],
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            setTitle('');
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            p: 0.5,
            borderRadius: 1.5,
            border: isFocused ? '1px solid #2955FF' : '1px dashed #D1D5DB',
            bgcolor: isFocused ? '#fff' : 'transparent',
            transition: 'all 0.15s',
            '&:hover': {
                borderColor: '#9CA3AF',
                bgcolor: '#fff',
            },
        }}>
            <AddIcon sx={{ fontSize: '1rem', color: isFocused ? '#2955FF' : '#9CA3AF', ml: 0.5 }} />
            <TextField
                fullWidth
                placeholder="Add a task..."
                variant="standard"
                size="small"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={createMutation.isPending}
                InputProps={{
                    disableUnderline: true,
                    sx: {
                        fontSize: '0.8rem',
                        py: 0.5,
                    },
                }}
            />
        </Box>
    );
};

export default QuickAdd;
