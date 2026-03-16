/**
 * MagicInput — AI-powered task creation overlay for QuickAdd
 *
 * Enhances the existing QuickAdd text field with real-time NLP parsing.
 * Extracted fields appear as preview chips below the input.
 * Parsed values auto-fill into the task creation payload.
 *
 * Falls back gracefully: if parsing is uncertain, keeps raw text as title.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, TextField, Chip, Fade } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Task } from '../types';
import { parseTaskInput, ParsedTaskInput } from '../utils/magicInputParser';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LabelIcon from '@mui/icons-material/Label';
import FlagIcon from '@mui/icons-material/Flag';

interface MagicInputProps {
  projectId: number;
  defaultStatus?: Task['status'];
  onSuccess?: () => void;
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: '#FEF2F2', text: '#EF4444' },
  medium: { bg: '#EFF6FF', text: '#3B82F6' },
  low: { bg: '#F3F4F6', text: '#6B7280' },
};

const MagicInput: React.FC<MagicInputProps> = ({ projectId, defaultStatus = 'todo', onSuccess }) => {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedTaskInput | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (newTask: Omit<Task, 'id'>) => api.createTask(newTask),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setRawText('');
      setParsed(null);
      if (onSuccess) onSuccess();
    },
  });

  // Debounced parsing (300ms)
  const doParse = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (text.trim().length >= 2) {
        const result = parseTaskInput(text);
        setParsed(result);
      } else {
        setParsed(null);
      }
    }, 300);
  }, []);

  useEffect(() => {
    doParse(rawText);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawText, doParse]);

  const handleSubmit = () => {
    if (!rawText.trim()) return;

    const taskData: Omit<Task, 'id'> = {
      title: parsed?.title || rawText.trim(),
      project_id: projectId,
      status: defaultStatus,
      assignee_ids: [],
      tags: parsed?.tags || [],
      start_date: parsed?.startDate || undefined,
      due_date: parsed?.endDate || undefined,
      priority: parsed?.priority || undefined,
    };

    createMutation.mutate(taskData);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setRawText('');
      setParsed(null);
      (e.target as HTMLInputElement).blur();
    }
  };

  const hasExtracted = parsed && parsed.confidence > 0.3 && (
    parsed.startDate || parsed.endDate || parsed.tags.length > 0 || parsed.priority
  );

  return (
    <Box>
      {/* Input field */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          p: 0.5,
          borderRadius: 1.5,
          border: isFocused ? '1px solid #2955FF' : '1px dashed #D1D5DB',
          bgcolor: isFocused ? '#fff' : 'transparent',
          transition: 'all 0.15s',
          '&:hover': {
            borderColor: '#9CA3AF',
            bgcolor: '#fff',
          },
        }}
      >
        {hasExtracted ? (
          <AutoAwesomeIcon sx={{ fontSize: '0.9rem', color: '#7C3AED', ml: 0.5 }} />
        ) : (
          <AddIcon sx={{ fontSize: '1rem', color: isFocused ? '#2955FF' : '#9CA3AF', ml: 0.5 }} />
        )}
        <TextField
          fullWidth
          placeholder="Add a task... (자연어로 입력 가능)"
          variant="standard"
          size="small"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={createMutation.isPending}
          InputProps={{
            disableUnderline: true,
            sx: { fontSize: '0.8rem', py: 0.5 },
          }}
        />
      </Box>

      {/* Preview chips — only show when extracted fields exist */}
      <Fade in={!!hasExtracted} timeout={200}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            mt: 0.5,
            px: 0.5,
            minHeight: hasExtracted ? 24 : 0,
          }}
        >
          {parsed?.title && parsed.title !== rawText.trim() && (
            <Chip
              label={parsed.title}
              size="small"
              variant="outlined"
              sx={{
                height: 20,
                fontSize: '0.62rem',
                fontWeight: 600,
                borderColor: '#E5E7EB',
                color: '#374151',
                '& .MuiChip-label': { px: 0.8 },
              }}
            />
          )}

          {(parsed?.startDate || parsed?.endDate) && (
            <Chip
              icon={<CalendarTodayIcon sx={{ fontSize: '0.65rem !important' }} />}
              label={
                parsed.startDate && parsed.endDate
                  ? `${parsed.startDate} ~ ${parsed.endDate}`
                  : parsed.endDate
                    ? `~ ${parsed.endDate}`
                    : `${parsed.startDate} ~`
              }
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: '#EEF2FF',
                color: '#2955FF',
                border: '1px solid #C7D2FE',
                '& .MuiChip-icon': { color: '#2955FF', ml: 0.3 },
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}

          {parsed?.tags.map(tag => (
            <Chip
              key={tag}
              icon={<LabelIcon sx={{ fontSize: '0.65rem !important' }} />}
              label={tag}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: '#F0FDF4',
                color: '#16A34A',
                border: '1px solid #BBF7D0',
                '& .MuiChip-icon': { color: '#16A34A', ml: 0.3 },
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          ))}

          {parsed?.priority && (
            <Chip
              icon={<FlagIcon sx={{ fontSize: '0.65rem !important' }} />}
              label={parsed.priority}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: PRIORITY_COLORS[parsed.priority]?.bg || '#F3F4F6',
                color: PRIORITY_COLORS[parsed.priority]?.text || '#6B7280',
                border: `1px solid ${PRIORITY_COLORS[parsed.priority]?.text || '#6B7280'}30`,
                '& .MuiChip-icon': { color: PRIORITY_COLORS[parsed.priority]?.text, ml: 0.3 },
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}
        </Box>
      </Fade>
    </Box>
  );
};

export default MagicInput;
