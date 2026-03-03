// src/features/project/ProjectFilesView.tsx
import React, { useRef, useState } from 'react';
import {
    Box, Typography, Button, Paper, IconButton, Tooltip,
    CircularProgress, Alert, LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import ImageIcon from '@mui/icons-material/Image';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ProjectFile } from '../../types';
import { useAppStore } from '../../stores/useAppStore';

interface ProjectFilesViewProps {
    projectId: number;
}

const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return <PictureAsPdfIcon sx={{ color: '#EF4444' }} />;
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return <DescriptionIcon sx={{ color: '#2955FF' }} />;
    if (['xls', 'xlsx', 'csv'].includes(ext)) return <DescriptionIcon sx={{ color: '#22C55E' }} />;
    if (['ppt', 'pptx'].includes(ext)) return <DescriptionIcon sx={{ color: '#F59E0B' }} />;
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return <ImageIcon sx={{ color: '#8B5CF6' }} />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FolderZipIcon sx={{ color: '#6B7280' }} />;
    return <InsertDriveFileIcon sx={{ color: '#9CA3AF' }} />;
};

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const formatDate = (dateStr: string): string => {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
};

const ProjectFilesView: React.FC<ProjectFilesViewProps> = ({ projectId }) => {
    const queryClient = useQueryClient();
    const currentUserId = useAppStore((s) => s.currentUserId);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const { data: files = [], isLoading, error } = useQuery<ProjectFile[]>({
        queryKey: ['projectFiles', projectId],
        queryFn: () => api.getProjectFiles(projectId, currentUserId),
    });

    const uploadMutation = useMutation({
        mutationFn: (file: File) => api.uploadProjectFile(projectId, file, currentUserId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projectFiles', projectId] });
            setUploading(false);
        },
        onError: () => setUploading(false),
    });

    const deleteMutation = useMutation({
        mutationFn: (fileId: number) => api.deleteProjectFile(projectId, fileId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projectFiles', projectId] }),
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        setUploading(true);
        Array.from(selectedFiles).forEach((file) => uploadMutation.mutate(file));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownload = (file: ProjectFile) => {
        const url = api.downloadProjectFile(projectId, file.id, currentUserId);
        window.open(url, '_blank');
    };

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error" sx={{ m: 2 }}>파일 목록을 불러오는 중 오류가 발생했습니다.</Alert>;
    }

    return (
        <Box sx={{ p: 2 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        첨부파일
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
                        프로젝트에 관련된 파일을 관리합니다 · {files.length}개의 파일
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<CloudUploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    sx={{ bgcolor: '#2955FF', textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 2.5 }}
                >
                    {uploading ? '업로드 중...' : '파일 업로드'}
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={handleFileSelect}
                />
            </Box>

            {uploading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

            {/* File List */}
            {files.length === 0 ? (
                <Paper
                    sx={{
                        p: 6, textAlign: 'center', borderRadius: 3,
                        border: '2px dashed #E5E7EB', bgcolor: '#FAFAFA',
                    }}
                >
                    <InsertDriveFileIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1 }} />
                    <Typography variant="body1" sx={{ color: '#9CA3AF', fontWeight: 500 }}>
                        첨부파일이 없습니다
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#D1D5DB', mt: 0.5 }}>
                        파일을 업로드하여 프로젝트를 관리하세요
                    </Typography>
                </Paper>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {files.map((file) => (
                        <Paper
                            key={file.id}
                            sx={{
                                p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2,
                                border: '1px solid #F3F4F6',
                                transition: 'all 0.15s',
                                '&:hover': { borderColor: '#2955FF', boxShadow: '0 2px 8px rgba(41,85,255,0.08)' },
                            }}
                        >
                            <Box sx={{ flexShrink: 0, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 1.5, bgcolor: '#F9FAFB' }}>
                                {getFileIcon(file.filename)}
                            </Box>
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }} noWrap>
                                    {file.filename}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 2, mt: 0.3 }}>
                                    <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                                        {formatFileSize(file.size)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                                        {formatDate(file.created_at)}
                                    </Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip title="다운로드">
                                    <IconButton size="small" onClick={() => handleDownload(file)} sx={{ color: '#2955FF' }}>
                                        <DownloadIcon sx={{ fontSize: '1.1rem' }} />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="삭제">
                                    <IconButton
                                        size="small"
                                        onClick={() => { if (window.confirm('이 파일을 삭제하시겠습니까?')) deleteMutation.mutate(file.id); }}
                                        sx={{ color: '#EF4444' }}
                                    >
                                        <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Paper>
                    ))}
                </Box>
            )}
        </Box>
    );
};

export default ProjectFilesView;
