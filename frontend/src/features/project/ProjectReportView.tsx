// src/features/project/ProjectReportView.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
    Tabs,
    Tab,
    TextField,
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
import SendIcon from "@mui/icons-material/Send";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";

import { api } from "../../api/client";
import { ProjectAiQueryResponse } from "../../types";
import { useAppStore } from "../../stores/useAppStore";

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

const parseMarkdownToParagraphs = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => (
        <Typography key={idx} variant="body2" sx={{ color: "#374151", lineHeight: 1.6, mb: line.trim() === "" ? 1 : 0.5 }}>
            {line}
        </Typography>
    ));
};

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
    const currentUserId = useAppStore(state => state.currentUserId);
    const [tabVal, setTabVal] = useState(0);

    // Structured data (loaded instantly on mount)
    const [structuredData, setStructuredData] = useState<ReportData["structured"] | null>(null);
    const [structuredLoading, setStructuredLoading] = useState(true);

    // AI summary state (loaded on demand)
    const [aiSections, setAiSections] = useState<ReportData["sections"] | null>(null);
    const [aiModel, setAiModel] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reportRef = useRef<HTMLDivElement>(null);

    // Legacy compat: build a combined "data" object for PDF/Word export
    const data = structuredData ? { structured: structuredData, sections: aiSections, model: aiModel, report: "" } as unknown as ReportData : null;

    // New AI Query State
    const [queryData, setQueryData] = useState<ProjectAiQueryResponse | null>(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryText, setQueryText] = useState("");
    const [queryError, setQueryError] = useState<string | null>(null);
    const queryReportRef = useRef<HTMLDivElement>(null);

    // Load structured data instantly on mount
    useEffect(() => {
        let cancelled = false;
        setStructuredLoading(true);
        api.getReportData(projectId).then((result: any) => {
            if (!cancelled) {
                setStructuredData(result.structured);
                setStructuredLoading(false);
            }
        }).catch(() => {
            if (!cancelled) setStructuredLoading(false);
        });
        return () => { cancelled = true; };
    }, [projectId]);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await api.generateReport(projectId);
            const rd = result as unknown as ReportData;
            setAiSections(rd.sections);
            setAiModel(rd.model);
            // Also refresh structured data from AI response
            if (rd.structured) setStructuredData(rd.structured);
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err.message || "Failed to generate report";
            setError(detail);
        } finally {
            setLoading(false);
        }
    };

    const handleQuery = async () => {
        if (!queryText.trim()) return;
        setQueryLoading(true);
        setQueryError(null);
        try {
            const result = await api.queryProjectAi(projectId, queryText, currentUserId);
            setQueryData(result);
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err.message || "Failed to query AI";
            setQueryError(detail);
        } finally {
            setQueryLoading(false);
        }
    };

    const handleDownloadPdf = async (targetRef: React.RefObject<HTMLDivElement>, prefix: string) => {
        if (!targetRef.current) return;
        try {
            const html2pdf = (await import("html2pdf.js")).default;
            html2pdf()
                .set({
                    margin: 10,
                    filename: `${prefix}_${projectId}.pdf`,
                    image: { type: "jpeg", quality: 0.98 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                })
                .from(targetRef.current)
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
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tabVal} onChange={(_e, v) => setTabVal(v)} sx={{ "& .MuiTab-root": { fontWeight: 600, fontSize: "0.9rem" } }}>
                    <Tab label="종합 보고서 생성" />
                    <Tab label="AI 자유 질문" />
                </Tabs>
            </Box>

            {tabVal === 0 && (
                <Box>
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
                            {structuredData && (
                                <>
                                    <Button
                                        variant="outlined"
                                        startIcon={<PictureAsPdfIcon />}
                                        onClick={() => handleDownloadPdf(reportRef, 'project_report')}
                                        size="small"
                                        sx={{ borderColor: "#E5E7EB", color: "#374151" }}
                                    >
                                        PDF
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        startIcon={<DescriptionIcon />}
                                        onClick={handleDownloadWord}
                                        size="small"
                                        sx={{ borderColor: "#E5E7EB", color: "#374151" }}
                                    >
                                        Word
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="contained"
                                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : aiSections ? <RefreshIcon /> : <AutoAwesomeIcon />}
                                onClick={handleGenerate}
                                disabled={loading}
                                size="small"
                                sx={{ bgcolor: "#2955FF", px: 2, borderRadius: 2 }}
                            >
                                {loading ? "AI 분석 중..." : aiSections ? "AI 재분석" : "AI 분석 생성"}
                            </Button>
                        </Box>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {structuredLoading && (
                        <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3, border: "1px solid #E5E7EB" }}>
                            <CircularProgress size={32} sx={{ color: "#2955FF", mb: 1 }} />
                            <Typography variant="body2" sx={{ color: "#6B7280" }}>데이터 로딩 중...</Typography>
                        </Paper>
                    )}

                    {loading && (
                        <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 2, borderRadius: 2 }}>
                            AI 분석 보고서 생성 중... (1~2분 소요될 수 있습니다)
                        </Alert>
                    )}
                    {/* ═══ Report Content ═══ */}
                    {s && sb && !structuredLoading && (
                        <Box ref={reportRef}>
                            {/* Model badge */}
                            <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
                                {aiModel && (
                                    <Chip
                                        label={`AI: ${aiModel}`}
                                        size="small"
                                        sx={{ bgcolor: "#EEF2FF", color: "#2955FF", fontWeight: 600, fontSize: "0.7rem" }}
                                    />
                                )}
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
            )}

            {tabVal === 1 && (
                <Box>
                    {/* Header */}
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <LightbulbIcon sx={{ color: "#F59E0B", fontSize: "1.8rem" }} />
                            <Box>
                                <Typography variant="h5" sx={{ fontWeight: 800, color: "#1A1D29" }}>
                                    Project AI Query
                                </Typography>
                                <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.8rem" }}>
                                    프로젝트 컨텍스트에 기반하여 자유롭게 AI에게 질문하세요.
                                </Typography>
                            </Box>
                        </Box>
                        {queryData && (
                            <Button
                                variant="outlined"
                                startIcon={<PictureAsPdfIcon />}
                                onClick={() => handleDownloadPdf(queryReportRef, 'project_query')}
                                size="small"
                                sx={{ borderRadius: 2 }}
                            >
                                Save PDF
                            </Button>
                        )}
                    </Box>

                    <Paper sx={{ p: 2, mb: 3, display: "flex", alignItems: "center", gap: 2, borderRadius: 3, border: "1px solid #E5E7EB" }}>
                        <TextField
                            fullWidth
                            placeholder="예: 이번 달 마감인 일정을 정리해줘"
                            value={queryText}
                            onChange={(e) => setQueryText(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleQuery()}
                            disabled={queryLoading}
                            variant="outlined"
                            size="small"
                        />
                        <Button
                            variant="contained"
                            onClick={handleQuery}
                            disabled={queryLoading || !queryText.trim()}
                            endIcon={queryLoading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                            sx={{ minWidth: 100, bgcolor: "#1A1D29", borderRadius: 2 }}
                        >
                            질문하기
                        </Button>
                    </Paper>

                    {queryError && <Alert severity="error" sx={{ mb: 2 }}>{queryError}</Alert>}

                    {!queryData && !queryLoading && !queryError && (
                        <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3, border: "2px dashed #E5E7EB", bgcolor: "#FAFBFC", mt: 2 }}>
                            <LightbulbIcon sx={{ fontSize: "3rem", color: "#FDE68A", mb: 1 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: "#374151" }}>AI에게 프로젝트에 대해 질문해보세요</Typography>
                        </Paper>
                    )}

                    {queryData && !queryLoading && (
                        <Box ref={queryReportRef} sx={{ bgcolor: "#FFFFFF", p: { xs: 0, sm: 2 } }}>
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 600 }}>Q. {queryData.query}</Typography>
                            </Box>

                            <Paper sx={{ p: 3, mb: 2, borderRadius: 3, border: "1px solid #E5E7EB", bgcolor: "#EEF2FF" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                                    <AutoAwesomeIcon sx={{ color: "#2955FF", fontSize: "1.2rem" }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#2955FF", fontSize: "1rem" }}>AI 요약</Typography>
                                </Box>
                                <Typography variant="body1" sx={{ color: "#1A1D29", fontWeight: 600, lineHeight: 1.6 }}>
                                    {queryData.parsed_response.one_liner}
                                </Typography>
                            </Paper>

                            <Paper sx={{ p: 3, mb: 2, borderRadius: 3, border: "1px solid #E5E7EB" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                                    <SummarizeIcon sx={{ color: "#4B5563", fontSize: "1.2rem" }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#374151", fontSize: "1rem" }}>상세 내용</Typography>
                                </Box>
                                {parseMarkdownToParagraphs(queryData.parsed_response.details)}
                            </Paper>

                            <Paper sx={{ p: 3, mb: 2, borderRadius: 3, border: "1px solid #E5E7EB" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                                    <EventAvailableIcon sx={{ color: "#14B8A6", fontSize: "1.2rem" }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#0D9488", fontSize: "1rem" }}>핵심 일정</Typography>
                                </Box>
                                {parseMarkdownToParagraphs(queryData.parsed_response.key_schedule)}
                            </Paper>

                            <Paper sx={{ p: 3, borderRadius: 3, border: "1px solid #E5E7EB" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                                    <CheckCircleOutlineIcon sx={{ color: "#F59E0B", fontSize: "1.2rem" }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#D97706", fontSize: "1rem" }}>다음 액션</Typography>
                                </Box>
                                {parseMarkdownToParagraphs(queryData.parsed_response.next_actions)}
                            </Paper>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default ProjectReportView;
