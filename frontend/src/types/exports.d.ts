declare module 'html-docx-js' {
    export function asBlob(html: string, options?: any): Blob;
}

declare module 'html2pdf.js' {
    const html2pdf: any;
    export default html2pdf;
}
