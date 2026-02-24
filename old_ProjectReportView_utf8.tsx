// src/features/project/ProjectReportView.tsx
import React, { useMemo, useRef, useState } from "react";
import {
    Box,
    Typography,
    Button,
    Paper,
    CircularProgress,
    Alert,
    Chip,
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DescriptionIcon from "@mui/icons-material/Description";
import RefreshIcon from "@mui/icons-material/Refresh";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import SummarizeIcon from "@mui/icons-material/Summarize";
import InsightsIcon from "@mui/icons-material/Insights";

import { api } from "../../api/client";

/* ─────────────────────────────────────────────────────────────
   ✅ Executive Summary Utilities
───────────────────────────────────────────────────────────── */

// ✅ markdown/불필요 문자 제거 (절대 그대로 출력되지 않게)
const cleanText = (text?: string | null) => {
    if (!text) return "";

    return String(text)
        // headings
        .replace(/^#{1,6}\s+/gm, "")
        // tables pipes
        .replace(/\|/g, " ")
        // bold/italic/code/underline-like
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        // list markers
        .replace(/^[-*]\s+/gm, "")
        .replace(/^\d+\.\s+/gm, "")
        // section tags
        .replace(/\[섹션\d+.*?\]/g, "")
        // extra spaces/newlines
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};

// ✅ 문장 단위 분리(마침표/물음표/느낌표 기준) + 너무 긴 문장 가독성 분해
const splitSentences = (text: string) => {
    const cleaned = cleanText(text)
        .replace(/\n+/g, " ")
        .trim();

    if (!cleaned) return [];

    const raw = cleaned
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const MAX_LEN = 140;
    const out: string[] = [];

    for (const s of raw) {
        if (s.length <= MAX_LEN) {
            out.push(s);
            continue;
        }

        // 1차: 쉼표/세미콜론 기준
        const chunks = s
            .split(/[,;]\s+/)
            .map((c) => c.trim())
            .filter(Boolean);

        if (chunks.length >= 2) {
            out.push(chunks.slice(0, 2).join(", ") + (chunks.length > 2 ? "…" : ""));
            continue;
        }

        // 2차: 접속사 기준
        const chunks2 = s
            .split(/\s+(그리고|하지만|또한|다만)\s+/)
            .filter(Boolean);

        if (chunks2.length >= 2) out.push(chunks2.slice(0, 2).join(" … "));
        else out.push(s.slice(0, MAX_LEN) + "…");
    }

    return out;
};

// ✅ 하이라이트 토큰 분리 (% / 상태 키워드)
const tokenizeHighlights = (sentence: string) => {
    const statusRe = /(Done|In-Progress|In Progress|Hold|완료|진행\s?중|보류|대기)/gi;
    const percentRe = /(\d+(?:\.\d+)?%)/g;
    const combined = new RegExp(`${percentRe.source}|${statusRe.source}`, "gi");

    return String(sentence)
        .split(combined)
        .map((p) => (p ?? ""))
        .filter((p) => p.trim().length > 0);
};

type ExecutiveSummaryBlockProps = {
    projectName: string;
    text: string;
};

const ExecutiveSummaryBlock: React.FC<ExecutiveSummaryBlockProps> = ({ projectName, text }) => {
    const sentences = useMemo(() => splitSentences(text), [text]);

    const mainLines = sentences.length > 1 ? sentences.slice(0, -1) : sentences;
    const conclusion = sentences.length > 1 ? sentences[sentences.length - 1] : "";

    const renderLine = (line: string, isConclusion = false) => {
        const parts = tokenizeHighlights(line);

        const statusChip = (label: string, bg: string, color: string, key: string | number) => (
            <Chip
                key={key}
                label={label}
                size="small"
                sx={{
                    height: 20,
                    fontSize: "0.7em",
                    bgcolor: bg,
                    color,
                    mx: 0.5,
                    fontWeight: 700,
                }}
            />
        );

        return (
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.5,
                    ...(isConclusion
                        ? {
                            mt: 0.5,
                            p: 1.5,
                            bgcolor: "rgba(41,85,255,0.06)",
                            borderRadius: 2,
                            borderLeft: "3px solid #2955FF",
                        }
                        : {}),
                }}
            >
                {!isConclusion && (
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#CBD5E1", mt: 0.8, flexShrink: 0 }} />
                )}

                <Typography
                    sx={{
                        fontSize: isConclusion ? "0.9rem" : "0.85rem",
                        lineHeight: 1.6,
                        color: isConclusion ? "#111827" : "#374151",
                        fontWeight: isConclusion ? 600 : 400,
                        textAlign: "left",
                    }}
                >
                    {parts
                        .map((p) => (p ?? ""))            // ✅ undefined 방지
                        .filter((p) => p.trim().length)   // ✅ 빈 토큰 제거
                        .map((part, idx) => {
                            const normalized = String(part).trim();

                            // ✅ 퍼센트 강조
                            if (/^\d+(?:\.\d+)?%$/.test(normalized)) {
                                return (
                                    <span key={idx} style={{ color: "#2955FF", fontWeight: 800 }}>
                                        {normalized}
                                    </span>
                                );
                            }

                            // ✅ 상태 배지 (영문/국문)
                            if (/^done$/i.test(normalized) || normalized === "완료") {
                                return statusChip(normalized === "완료" ? "완료" : "Done", "#DCFCE7", "#16A34A", idx);
                            }
                            if (/^(in-progress|in progress)$/i.test(normalized) || normalized.replace(/\s/g, "") === "진행중") {
                                return statusChip(normalized.includes("진행") ? "진행 중" : "In-Progress", "#EEF2FF", "#2955FF", idx);
                            }
                            if (/^hold$/i.test(normalized) || normalized === "보류") {
                                return statusChip(normalized === "보류" ? "보류" : "Hold", "#FEF3C7", "#D97706", idx);
                            }
                            if (normalized === "대기") {
                                return statusChip("대기", "#F3F4F6", "#6B7280", idx);
                            }

                            return <span key={idx}>{part}</span>;
                        })}
                </Typography>
            </Box>
        );
    };

    if (!text) return null;

    return (
        <Box
            sx={{
                border: "1px solid #E5E7EB",
                borderRadius: 3,
                p: 2.5,
                bgcolor: "#FFFFFF",
            }}
        >
            {/* ✅ 프로젝트명 첫 줄 강조 */}
            <Typography
                sx={{
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    color: "#111827",
                    mb: 1.5,
                    textAlign: "left",
                }}
            >
                {projectName}
            </Typography>

            {/* ✅ 문장 단위 / 한 줄씩 / 간격 8~12px */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                {mainLines.map((line, i) => (
                    <React.Fragment key={i}>{renderLine(line, false)}</React.Fragment>
                ))}

                {/* ✅ 마지막 문장 = 종합 평가 문장 분리 */}
                {conclusion && renderLine(conclusion, true)}
            </Box>
        </Box>
    );
};

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */

interface TaskDetail {
    id: number;
    title: string;
    description: string;
    status: string;
    priority: string;
    progress: number;
    start_date: string | null;
    due_date: string | null;
    assignees: string[];
    sub_project: string;
    tags: string[];
    attachments: { id: number; filename: string; url: string; type: string }[];
}

interface ReportData {
    report: string;
    model: string;
    sections: {
        overview: string;
        task_analysis: string;
        status_analysis: string;
        next_steps: string;
    };
    structured: {
        project: { name: string; description: string; created_at: string };
        status_breakdown: {
            total: number;
            active: number;
            done: number;
            in_progress: number;
            todo: number;
            hold: number;
            overall_progress: number;
        };
        tasks: TaskDetail[];
        sub_projects: { name: string; description: string }[];
        members: string[];
    };
}

interface ProjectReportViewProps {
    projectId: number;
}

const statusColor: Record<string, string> = {
    done: "#22C55E",
    in_progress: "#2955FF",
    todo: "#6B7280",
    hold: "#F59E0B",
};
const statusLabel: Record<string, string> = {
    done: "Done",
    in_progress: "In Progress",
    todo: "To Do",
    hold: "Hold",
};
const priorityColor: Record<string, string> = {
    high: "#EF4444",
    medium: "#F59E0B",
    low: "#22C55E",
};

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */

const ProjectReportView: React.FC<ProjectReportViewProps> = ({ projectId }) => {
    const [data, setData] = useState<ReportData | null>(null); // ✅ AI Report는 상태로 유지
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reportRef = useRef<HTMLDivElement>(null);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await api.generateReport(projectId);
            setData(result as unknown as ReportData);
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err.message || "Failed to generate report";
            setError(detail);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!reportRef.current) return;
        try {
            const html2pdf = (await import("html2pdf.js")).default;
            html2pdf()
                .set({
                    margin: 10,
                    filename: `project_report_${projectId}.pdf`,
                    image: { type: "jpeg", quality: 0.98 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                })
                .from(reportRef.current)
                .save();
        } catch {
            alert("PDF generation failed.");
        }
    };

    const handleDownloadWord = () => {
        if (!reportRef.current) return;
        const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <style>
      body{font-family:'Malgun Gothic',Arial,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:20px;}
      table{border-collapse:collapse;width:100%;margin:12px 0;}
      th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px;}
      th{background-color:#2955FF;color:#fff;font-weight:700;}
      tr:nth-child(even){background-color:#f9f9f9;}
      h2{color:#2955FF;border-bottom:2px solid #EEF2FF;padding-bottom:4px;}
      </style></head>
      <body>${reportRef.current.innerHTML}</body></html>`;
        const blob = new Blob(["\ufeff", htmlContent], { type: "application/msword" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `project_report_${projectId}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const s = data?.structured;
    const sb = s?.status_breakdown;
    const sections = data?.sections;

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <AutoAwesomeIcon sx={{ color: "#2955FF", fontSize: "1.8rem" }} />
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: "#1A1D29" }}>
                            AI Project Report
                        </Typography>
                        <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem" }}>
                            프로젝트 데이터를 AI로 분석하여 종합 보고서를 생성합니다
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: "flex", gap: 1 }}>
                    {data && (
                        <>
                            <Button
                                variant="outlined"
                                startIcon={<PictureAsPdfIcon />}
                                onClick={handleDownloadPdf}
                                size="small"
                                sx={{
                                    borderColor: "#E5E7EB",
                                    color: "#374151",
                                    textTransform: "none",
                                    fontWeight: 600,
                                    fontSize: "0.8rem",
                                    "&:hover": { bgcolor: "#FEF2F2", borderColor: "#EF4444", color: "#EF4444" },
                                }}
                            >
                                PDF
                            </Button>

                            <Button
                                variant="outlined"
                                startIcon={<DescriptionIcon />}
                                onClick={handleDownloadWord}
                                size="small"
                                sx={{
                                    borderColor: "#E5E7EB",
                                    color: "#374151",
                                    textTransform: "none",
                                    fontWeight: 600,
                                    fontSize: "0.8rem",
                                    "&:hover": { bgcolor: "#EFF6FF", borderColor: "#2955FF", color: "#2955FF" },
                                }}
                            >
                                Word
                            </Button>
                        </>
                    )}

                    <Button
                        variant="contained"
                        startIcon={
                            loading ? <CircularProgress size={16} color="inherit" /> : data ? <RefreshIcon /> : <AutoAwesomeIcon />
                        }
                        onClick={handleGenerate}
                        disabled={loading}
                        size="small"
                        sx={{
                            bgcolor: "#2955FF",
                            textTransform: "none",
                            fontWeight: 700,
                            fontSize: "0.85rem",
                            px: 2,
                            borderRadius: 2,
                            boxShadow: "0 2px 8px rgba(41,85,255,0.25)",
                            "&:hover": { bgcolor: "#1E3FCC" },
                        }}
                    >
                        {loading ? "Generating..." : data ? "Regenerate" : "Generate Report"}
                    </Button>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* Empty state */}
            {!data && !loading && !error && (
                <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3, border: "2px dashed #E5E7EB", bgcolor: "#FAFBFC" }}>
                    <AutoAwesomeIcon sx={{ fontSize: "3rem", color: "#CBD5E1", mb: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#374151", mb: 0.5 }}>
                        No Report Generated Yet
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#9CA3AF", mb: 2 }}>
                        "Generate Report" 버튼을 클릭하여 AI 기반 프로젝트 보고서를 생성하세요.
                        <br />
                        AI Settings 페이지에서 API 설정이 완료되어 있어야 합니다.
                    </Typography>
                </Paper>
            )}

            {/* Loading */}
            {loading && (
                <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3, border: "1px solid #E5E7EB" }}>
                    <CircularProgress size={40} sx={{ color: "#2955FF", mb: 2 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#374151" }}>
                        Generating Report...
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#9CA3AF" }}>
                        AI가 프로젝트 데이터를 분석하고 있습니다. 잠시만 기다려주세요.
                    </Typography>
                </Paper>
            )}

            {/* ═══ Report Content ═══ */}
            {data && s && sb && !loading && (
                <Box ref={reportRef}>
                    {/* Model badge */}
                    <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
                        <Chip
                            label={`Generated by ${data.model}`}
                            size="small"
                            sx={{ bgcolor: "#EEF2FF", color: "#2955FF", fontWeight: 600, fontSize: "0.7rem" }}
                        />
                        <Chip
                            label={`전체 진행률: ${sb.overall_progress}%`}
                            size="small"
                            sx={{
                                bgcolor: sb.overall_progress >= 80 ? "#DCFCE7" : sb.overall_progress >= 50 ? "#FEF3C7" : "#FEE2E2",
                                color: sb.overall_progress >= 80 ? "#16A34A" : sb.overall_progress >= 50 ? "#D97706" : "#DC2626",
                                fontWeight: 700,
                                fontSize: "0.75rem",
                            }}
                        />
                    </Box>

                    {/* ─── Section 1: Project Overview Card ─── */}
                    <Paper
                        sx={{
                            p: 3,
                            mb: 2.5,
                            borderRadius: 3,
                            border: "1px solid #E5E7EB",
                            boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                            <SummarizeIcon sx={{ color: "#2955FF", fontSize: "1.2rem" }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: "#1A1D29", fontSize: "1rem" }}>
                                프로젝트 개요
                            </Typography>
                        </Box>

                        <Box sx={{ display: "flex", gap: 2, mb: 2.5, flexWrap: "wrap" }}>
                            <Box sx={{ flex: 1, minWidth: 200, bgcolor: "#F8FAFC", borderRadius: 2, p: 2, border: "1px solid #F1F5F9" }}>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: "#6B7280",
                                        fontWeight: 600,
                                        fontSize: "0.65rem",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    프로젝트
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1A1D29", fontSize: "1.1rem", mt: 0.3 }}>
                                    {s.project.name}
                                </Typography>
                                <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem", mt: 0.3 }}>
                                    {s.project.description || "설명 없음"}
                                </Typography>
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 200, bgcolor: "#F8FAFC", borderRadius: 2, p: 2, border: "1px solid #F1F5F9" }}>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: "#6B7280",
                                        fontWeight: 600,
                                        fontSize: "0.65rem",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    팀원
                                </Typography>
                                <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                    {s.members.length > 0 ? (
                                        s.members.map((m, i) => (
                                            <Chip
                                                key={i}
                                                label={m}
                                                size="small"
                                                sx={{ bgcolor: "#EEF2FF", color: "#2955FF", fontSize: "0.7rem", fontWeight: 500, height: 24 }}
                                            />
                                        ))
                                    ) : (
                                        <Typography variant="body2" sx={{ color: "#9CA3AF", fontSize: "0.8rem" }}>
                                            미배정
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        </Box>

                        {/* Progress bar */}
                        <Box sx={{ mb: 1.5 }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: "#374151", fontSize: "0.75rem" }}>
                                    전체 진행률 (Hold 제외)
                                </Typography>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: "#2955FF", fontSize: "0.85rem" }}>
                                    {sb.overall_progress}%
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={sb.overall_progress}
                                sx={{
                                    height: 10,
                                    borderRadius: 5,
                                    bgcolor: "#EEF2FF",
                                    "& .MuiLinearProgress-bar": {
                                        borderRadius: 5,
                                        bgcolor: sb.overall_progress >= 80 ? "#22C55E" : sb.overall_progress >= 50 ? "#2955FF" : "#F59E0B",
                                    },
                                }}
                            />
                        </Box>

                        {/* Status breakdown stats */}
                        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                            {[
                                { label: "전체", value: sb.total, color: "#374151", bg: "#F3F4F6" },
                                { label: "완료", value: sb.done, color: "#22C55E", bg: "#DCFCE7" },
                                { label: "진행 중", value: sb.in_progress, color: "#2955FF", bg: "#EEF2FF" },
                                { label: "대기", value: sb.todo, color: "#6B7280", bg: "#F3F4F6" },
                                { label: "보류", value: sb.hold, color: "#F59E0B", bg: "#FEF3C7" },
                            ].map((item) => (
                                <Box key={item.label} sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: item.bg }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: item.color, fontSize: "0.7rem" }}>
                                        {item.label}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: item.color, fontSize: "0.9rem" }}>
                                        {item.value}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        {/* ✅ AI narrative – overview (Executive Summary 블록 렌더링) */}
                        {sections?.overview && (
                            <Box sx={{ mt: 3 }}>
                                <ExecutiveSummaryBlock projectName={s.project.name} text={sections.overview} />
                            </Box>
                        )}
                    </Paper>

                    {/* ─── Section 2: Task Table ─── */}
                    <Paper
                        sx={{
                            p: 3,
                            mb: 2.5,
                            borderRadius: 3,
                            border: "1px solid #E5E7EB",
                            boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                            <AssignmentIcon sx={{ color: "#8B5CF6", fontSize: "1.2rem" }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: "#1A1D29", fontSize: "1rem" }}>
                                Task별 분석
                            </Typography>
                        </Box>

                        <TableContainer sx={{ borderRadius: 2, border: "1px solid #E5E7EB" }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: "#F8FAFC" }}>
                                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151", py: 1.2 }}>Task</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151", py: 1.2 }}>상태</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151", py: 1.2 }}>우선순위</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151", py: 1.2 }}>
                                            진행률
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151", py: 1.2 }}>마감일</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151", py: 1.2 }}>담당자</TableCell>
                                    </TableRow>
                                </TableHead>

                                <TableBody>
                                    {s.tasks.map((task) => (
                                        <TableRow
                                            key={task.id}
                                            sx={{
                                                "&:hover": { bgcolor: "#FAFBFF" },
                                                bgcolor: task.status === "hold" ? "#FFFBEB" : "transparent",
                                            }}
                                        >
                                            <TableCell sx={{ py: 1.2 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem", color: "#1A1D29" }}>
                                                    {task.title}
                                                </Typography>

                                                {task.description && (
                                                    <Typography
                                                        variant="caption"
                                                        sx={{ color: "#9CA3AF", fontSize: "0.7rem", display: "block", mt: 0.2 }}
                                                    >
                                                        {task.description.length > 60 ? task.description.slice(0, 60) + "..." : task.description}
                                                    </Typography>
                                                )}

                                                {task.sub_project && (
                                                    <Chip
                                                        label={task.sub_project}
                                                        size="small"
                                                        sx={{ mt: 0.3, height: 18, fontSize: "0.6rem", bgcolor: "#F3E8FF", color: "#8B5CF6" }}
                                                    />
                                                )}
                                            </TableCell>

                                            <TableCell sx={{ py: 1.2 }}>
                                                <Chip
                                                    label={statusLabel[task.status] || task.status}
                                                    size="small"
                                                    sx={{
                                                        height: 22,
                                                        fontSize: "0.65rem",
                                                        fontWeight: 700,
                                                        bgcolor: `${statusColor[task.status] || "#6B7280"}15`,
                                                        color: statusColor[task.status] || "#6B7280",
                                                    }}
                                                />
                                            </TableCell>

                                            <TableCell sx={{ py: 1.2 }}>
                                                <Chip
                                                    label={task.priority}
                                                    size="small"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: "0.6rem",
                                                        fontWeight: 600,
                                                        bgcolor: `${priorityColor[task.priority] || "#6B7280"}12`,
                                                        color: priorityColor[task.priority] || "#6B7280",
                                                        textTransform: "capitalize",
                                                    }}
                                                />
                                            </TableCell>

                                            <TableCell align="right" sx={{ py: 1.2 }}>
                                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={task.status === "done" ? 100 : task.progress}
                                                        sx={{
                                                            width: 50,
                                                            height: 6,
                                                            borderRadius: 3,
                                                            bgcolor: "#F3F4F6",
                                                            "& .MuiLinearProgress-bar": {
                                                                borderRadius: 3,
                                                                bgcolor: statusColor[task.status] || "#6B7280",
                                                            },
                                                        }}
                                                    />
                                                    <Typography
                                                        variant="caption"
                                                        sx={{ fontWeight: 700, color: "#374151", fontSize: "0.75rem", minWidth: 35, textAlign: "right" }}
                                                    >
                                                        {task.status === "done" ? 100 : task.progress}%
                                                    </Typography>
                                                </Box>
                                            </TableCell>

                                            <TableCell sx={{ py: 1.2 }}>
                                                <Typography variant="caption" sx={{ color: "#6B7280", fontSize: "0.75rem" }}>
                                                    {task.due_date || "미정"}
                                                </Typography>
                                            </TableCell>

                                            <TableCell sx={{ py: 1.2 }}>
                                                <Typography variant="caption" sx={{ color: "#6B7280", fontSize: "0.75rem" }}>
                                                    {task.assignees.length > 0 ? task.assignees.join(", ") : "미배정"}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {/* Overall row */}
                                    <TableRow sx={{ bgcolor: "#EEF2FF", "& td": { borderBottom: "none" } }}>
                                        <TableCell sx={{ py: 1.5 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 800, fontSize: "0.85rem", color: "#2955FF" }}>
                                                Overall (Hold 제외)
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ py: 1.5 }}>
                                            <Chip
                                                label={`${sb.active} Active`}
                                                size="small"
                                                sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700, bgcolor: "#2955FF", color: "#fff" }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ py: 1.5 }} />
                                        <TableCell align="right" sx={{ py: 1.5 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 800, fontSize: "0.95rem", color: "#2955FF" }}>
                                                {sb.overall_progress}%
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ py: 1.5 }} />
                                        <TableCell sx={{ py: 1.5 }} />
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>

                        {/* ✅ AI narrative – task analysis (Executive Summary 블록) */}
                        {sections?.task_analysis && (
                            <Box sx={{ mt: 2 }}>
                                <ExecutiveSummaryBlock projectName={s.project.name} text={sections.task_analysis} />
                            </Box>
                        )}
                    </Paper>

                    {/* ─── Section 2.5: Attachments Table ─── */}
                    {s.tasks.some((t) => t.attachments.length > 0) && (
                        <Paper
                            sx={{
                                p: 3,
                                mb: 2.5,
                                borderRadius: 3,
                                border: "1px solid #E5E7EB",
                                boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
                            }}
                        >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                                <AttachFileIcon sx={{ color: "#EC4899", fontSize: "1.2rem" }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1A1D29", fontSize: "1rem" }}>
                                    첨부 자료
                                </Typography>
                            </Box>

                            <TableContainer sx={{ borderRadius: 2, border: "1px solid #E5E7EB" }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: "#F8FAFC" }}>
                                            <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151" }}>Task</TableCell>
                                            <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151" }}>파일명</TableCell>
                                            <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151" }}>유형</TableCell>
                                            <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", color: "#374151" }}>URL</TableCell>
                                        </TableRow>
                                    </TableHead>

                                    <TableBody>
                                        {s.tasks
                                            .filter((t) => t.attachments.length > 0)
                                            .flatMap((task) =>
                                                task.attachments.map((att) => (
                                                    <TableRow key={att.id} sx={{ "&:hover": { bgcolor: "#FAFBFF" } }}>
                                                        <TableCell sx={{ py: 1 }}>
                                                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem", color: "#1A1D29" }}>
                                                                {task.title}
                                                            </Typography>
                                                        </TableCell>

                                                        <TableCell sx={{ py: 1 }}>
                                                            <Typography variant="body2" sx={{ fontSize: "0.8rem", color: "#374151" }}>
                                                                {att.filename || att.url}
                                                            </Typography>
                                                        </TableCell>

                                                        <TableCell sx={{ py: 1 }}>
                                                            <Chip label={att.type} size="small" sx={{ height: 20, fontSize: "0.6rem", bgcolor: "#FEE2E2", color: "#EF4444" }} />
                                                        </TableCell>

                                                        <TableCell sx={{ py: 1 }}>
                                                            {att.url && (
                                                                <Tooltip title={att.url}>
                                                                    <Typography
                                                                        variant="caption"
                                                                        sx={{
                                                                            color: "#2955FF",
                                                                            fontSize: "0.7rem",
                                                                            cursor: "pointer",
                                                                            "&:hover": { textDecoration: "underline" },
                                                                        }}
                                                                        onClick={() => window.open(att.url, "_blank")}
                                                                    >
                                                                        {att.url.length > 40 ? att.url.slice(0, 40) + "..." : att.url}
                                                                    </Typography>
                                                                </Tooltip>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}

                    {/* ─── Section 3: Status Analysis ─── */}
                    {sections?.status_analysis && (
                        <Paper
                            sx={{
                                p: 3,
                                mb: 2.5,
                                borderRadius: 3,
                                border: "1px solid #E5E7EB",
                                boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
                            }}
                        >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                                <InsightsIcon sx={{ color: "#22C55E", fontSize: "1.2rem" }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1A1D29", fontSize: "1rem" }}>
                                    종합 현황 분석
                                </Typography>
                            </Box>

                            {/* ✅ Executive Summary 블록으로 렌더 */}
                            <ExecutiveSummaryBlock projectName={s.project.name} text={sections.status_analysis} />
                        </Paper>
                    )}

                    {/* ─── Section 4: Next Steps ─── */}
                    {sections?.next_steps && (
                        <Paper
                            sx={{
                                p: 3,
                                mb: 2.5,
                                borderRadius: 3,
                                border: "1px solid #E5E7EB",
                                boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
                            }}
                        >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                                <LightbulbIcon sx={{ color: "#F59E0B", fontSize: "1.2rem" }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1A1D29", fontSize: "1rem" }}>
                                    다음 단계 제언
                                </Typography>
                            </Box>

                            {/* ✅ Executive Summary 블록으로 렌더 */}
                            <ExecutiveSummaryBlock projectName={s.project.name} text={sections.next_steps} />
                        </Paper>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default ProjectReportView;