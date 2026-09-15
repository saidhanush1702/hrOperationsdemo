import { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Trash2, FolderOpen, ImageIcon, Download } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { resolveFileUrl } from '../../../utils/fileUrl';
import { cx } from '../../../components/ui/kit';

const DocumentViewerModal = ({ isOpen = true, employee, onClose }) => {
    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const userRole = localStorage.getItem('userRole');

    useEffect(() => {
        if (employee?.id) {
            fetchDocuments();
        }
    }, [employee?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchDocuments = async () => {
        try {
            const res = await managementAPI.getEmployeeDocuments(employee.id);
            setDocuments(res.data);
            if (res.data.length > 0 && !selectedDoc) {
                setSelectedDoc(res.data[0]);
            }
        } catch (err) {
            console.error("Failed to load documents", err);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('document', file);

        setIsUploading(true);
        try {
            await managementAPI.uploadEmployeeDocument(employee.id, formData);
            await fetchDocuments();
        } catch {
            alert("Upload failed.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (docId, e) => {
        e.stopPropagation(); // Prevent selecting the card
        if (window.confirm("Are you sure you want to delete this document?")) {
            try {
                await managementAPI.deleteEmployeeDocument(docId);
                if (selectedDoc?.id === docId) setSelectedDoc(null);
                fetchDocuments();
            } catch {
                alert("Failed to delete document.");
            }
        }
    };

    if (!employee) return null;

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<FolderOpen size={18} />}
            title="Document vault"
            subtitle={`${employee.first_name} ${employee.last_name}`}
            noPadding={true}
        >
            <div className="flex h-full w-full flex-col overflow-hidden">
                {/* Upload + file shelf */}
                <div className="shrink-0 border-b border-(--border-subtle) p-4 sm:p-5">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current.click()}
                            disabled={isUploading}
                            className="flex items-center gap-3 rounded-[18px] border-2 border-dashed border-(--brand-primary)/35 bg-(--brand-primary)/5 px-4 py-3 text-left outline-none transition-colors hover:border-(--brand-primary) disabled:opacity-60"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] text-white" style={{ background: 'var(--brand-gradient)' }}>
                                <UploadCloud size={18} />
                            </span>
                            <span>
                                <span className="block text-sm font-semibold text-(--text-main)">{isUploading ? 'Uploading…' : 'Add a file'}</span>
                                <span className="block text-xs text-(--text-muted)">PDF, images or Word documents</span>
                            </span>
                        </button>
                        <p className="ml-auto text-sm text-(--text-muted)">
                            <span className="font-semibold text-(--text-main)">{documents.length}</span> files stored
                        </p>
                    </div>

                    {documents.length > 0 && (
                        <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                            {documents.map(doc => {
                                const on = selectedDoc?.id === doc.id;
                                const isImage = doc.file_type?.includes('image');
                                return (
                                    <div
                                        key={doc.id}
                                        onClick={() => setSelectedDoc(doc)}
                                        className={cx(
                                            'flex w-60 shrink-0 cursor-pointer items-center gap-3 rounded-[16px] border px-3 py-2.5 transition-colors',
                                            on ? 'border-(--brand-primary) bg-(--brand-primary)/10' : 'border-(--border-subtle) bg-(--bg-surface) hover:border-(--brand-primary)/50',
                                        )}
                                    >
                                        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', on ? 'text-white' : 'bg-(--text-main)/5 text-(--text-muted)')} style={on ? { background: 'var(--brand-gradient)' } : undefined}>
                                            {isImage ? <ImageIcon size={16} /> : <FileText size={16} />}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-(--text-main)">{doc.file_name}</span>
                                        {userRole === 'ORG_ADMIN' && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleDelete(doc.id, e)}
                                                className="shrink-0 rounded-full p-1.5 text-(--text-muted) transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                                                title="Delete file"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Preview stage */}
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0a0c16] p-4">
                    {selectedDoc ? (
                        selectedDoc.file_type.includes('image') ? (
                            <img src={resolveFileUrl(selectedDoc.file_url)} alt={selectedDoc.file_name} className="max-h-full max-w-full rounded-[14px] object-contain shadow-2xl" />
                        ) : selectedDoc.file_type.includes('pdf') ? (
                            <iframe src={resolveFileUrl(selectedDoc.file_url)} className="h-full w-full rounded-[14px] bg-white" title="PDF Preview"></iframe>
                        ) : (
                            <div className="text-center">
                                <FileText size={44} className="mx-auto mb-4 text-white/40" />
                                <p className="text-sm text-white/80">Preview is not available for this file type.</p>
                                <a href={resolveFileUrl(selectedDoc.file_url)} download className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:border-white/40">
                                    <Download size={13} /> Download file
                                </a>
                            </div>
                        )
                    ) : (
                        <div className="text-center text-white/50">
                            <FolderOpen size={40} className="mx-auto mb-3 opacity-60" />
                            <p className="text-sm">{documents.length === 0 ? 'No files uploaded yet.' : 'Select a file to preview.'}</p>
                        </div>
                    )}
                </div>
            </div>
        </BaseModal>
    );
};

export default DocumentViewerModal;
