import os
import re

old_file = 'old_ProjectReportView_utf8.tsx'
new_file = 'frontend/src/features/project/ProjectReportView.tsx'

with open(old_file, 'r', encoding='utf-8') as f:
    old_content = f.read()

# Add imports for Tabs, Tab, TextField, SendIcon, CheckCircleOutlineIcon, EventAvailableIcon
old_content = old_content.replace(
    '} from "@mui/material";',
    '    Tabs,\n    Tab,\n    TextField,\n    Divider,\n} from "@mui/material";'
)
old_content = old_content.replace(
    'import InsightsIcon from "@mui/icons-material/Insights";',
    'import InsightsIcon from "@mui/icons-material/Insights";\nimport SendIcon from "@mui/icons-material/Send";\nimport CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";\nimport EventAvailableIcon from "@mui/icons-material/EventAvailable";'
)
old_content = old_content.replace(
    'import { api } from "../../api/client";',
    'import { api } from "../../api/client";\nimport { ProjectAiQueryResponse } from "../../types";'
)

# Replace the component function
component_start = old_content.find('const ProjectReportView: React.FC<ProjectReportViewProps> = ({ projectId }) => {')
if component_start == -1:
    print("Component start not found")
    exit(1)

component_wrapper = """const ProjectReportView: React.FC<ProjectReportViewProps> = ({ projectId }) => {
    const [tabVal, setTabVal] = useState(0);

    // Old Report State
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reportRef = useRef<HTMLDivElement>(null);

    // New AI Query State
    const [queryData, setQueryData] = useState<ProjectAiQueryResponse | null>(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryText, setQueryText] = useState("");
    const [queryError, setQueryError] = useState<string | null>(null);
    const queryReportRef = useRef<HTMLDivElement>(null);

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

    const handleQuery = async () => {
        if (!queryText.trim()) return;
        setQueryLoading(true);
        setQueryError(null);
        try {
            const result = await api.queryProjectAi(projectId, queryText, 1);
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
        const blob = new Blob(["\\ufeff", htmlContent], { type: "application/msword" });
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
                <Tabs value={tabVal} onChange={(e, v) => setTabVal(v)} sx={{ "& .MuiTab-root": { fontWeight: 600, fontSize: "0.9rem" } }}>
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
                            {data && (
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
                                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : data ? <RefreshIcon /> : <AutoAwesomeIcon />}
                                onClick={handleGenerate}
                                disabled={loading}
                                size="small"
                                sx={{ bgcolor: "#2955FF", px: 2, borderRadius: 2 }}
                            >
                                {loading ? "Generating..." : data ? "Regenerate" : "Generate Report"}
                            </Button>
                        </Box>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {!data && !loading && !error && (
                        <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3, border: "2px dashed #E5E7EB", bgcolor: "#FAFBFC" }}>
                            <AutoAwesomeIcon sx={{ fontSize: "3rem", color: "#CBD5E1", mb: 1 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>No Report Generated Yet</Typography>
                            <Typography variant="body2" sx={{ color: "#9CA3AF" }}>"Generate Report" 버튼을 클릭하여 보고서를 생성하세요.</Typography>
                        </Paper>
                    )}

                    {loading && (
                        <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3, border: "1px solid #E5E7EB" }}>
                            <CircularProgress size={40} sx={{ color: "#2955FF", mb: 2 }} />
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>Generating Report...</Typography>
                        </Paper>
                    )}
"""

component_mid = """
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
"""

# Now we need to extract the JSX structure from the old render
# The old render starts with "            {/* ═══ Report Content ═══ */}"
# and ends right before "        </Box>\n    );\n};"

content_start = old_content.find('{/* ═══ Report Content ═══ */}')
if content_start == -1:
    print("Content start not found")
    exit(1)

content_end = old_content.find('        </Box>\n    );\n};', content_start)

if content_end == -1:
    content_end = old_content.rfind('        </Box>')

old_render_content = old_content[content_start:content_end]

final_file = old_content[:component_start] + component_wrapper + "                    " + old_render_content + "                </Box>\n            )}\n" + component_mid

# Add the parseMarkdownToParagraphs function if not exists
if 'const parseMarkdownToParagraphs' not in final_file:
    insert_pos = final_file.find('const splitSentences')
    parse_md = """
const parseMarkdownToParagraphs = (text: string) => {
    if (!text) return null;
    return text.split("\\n").map((line, idx) => (
        <Typography key={idx} variant="body2" sx={{ color: "#374151", lineHeight: 1.6, mb: line.trim() === "" ? 1 : 0.5 }}>
            {line}
        </Typography>
    ));
};

"""
    final_file = final_file[:insert_pos] + parse_md + final_file[insert_pos:]


with open(new_file, 'w', encoding='utf-8') as f:
    f.write(final_file)

print("Successfully merged project reports!")
