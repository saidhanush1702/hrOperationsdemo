import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, FileSignature } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

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
    }, [employee?.id]);

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
        } catch (err) {
            alert("Upload failed.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (docId, e) => {
        e.stopPropagation(); // Prevent clicking the row
        if (window.confirm("Are you sure you want to delete this document?")) {
            try {
                await managementAPI.deleteEmployeeDocument(docId);
                if (selectedDoc?.id === docId) setSelectedDoc(null);
                fetchDocuments();
            } catch (err) {
                alert("Failed to delete document.");
            }
        }
    };

    if (!employee) return null;

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<FileSignature size={16} />}
            title="Employee Documents"
            subtitle={`${employee.first_name} ${employee.last_name}`}
            noPadding={true} // Removes the p-8 so the split layout touches edges
        >
            <div className="flex w-full h-full overflow-hidden">
                
                {/* LEFT SIDEBAR - 1/4 Width */}
                <div className="w-1/4 border-r border-(--border-subtle) bg-(--bg-app) flex flex-col p-4 overflow-y-auto shrink-0">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" 
                    />
                    <button 
                        onClick={() => fileInputRef.current.click()} 
                        disabled={isUploading}
                        className="w-full flex items-center justify-center gap-2 bg-(--brand-primary) text-(--brand-primary-text) py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-sm hover:opacity-90 transition-all mb-4 disabled:opacity-50"
                    >
                        <Upload size={14} /> {isUploading ? "Uploading..." : "Upload Document"}
                    </button>

                    <div className="space-y-2">
                        <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest mb-2 px-1">Files</h3>
                        {documents.length === 0 ? (
                            <p className="text-xs text-(--text-muted) italic text-center mt-4">No documents uploaded.</p>
                        ) : (
                            documents.map(doc => (
                                <div 
                                    key={doc.id} 
                                    onClick={() => setSelectedDoc(doc)}
                                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border ${selectedDoc?.id === doc.id ? 'bg-(--brand-primary)/10 border-(--brand-primary)' : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--brand-primary)/50'}`}
                                >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <FileText size={14} className={`shrink-0 ${selectedDoc?.id === doc.id ? 'text-(--brand-primary)' : 'text-(--text-muted)'}`} />
                                        <span className="text-xs font-semibold text-(--text-main) truncate">{doc.file_name}</span>
                                    </div>
                                    {userRole === 'ORG_ADMIN' && (
                                        <button onClick={(e) => handleDelete(doc.id, e)} className="text-(--text-muted) hover:text-red-500 transition-colors p-1 shrink-0 ml-2">
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT PREVIEW - 3/4 Width */}
                <div className="flex-1 bg-[#1A1A1A] flex items-center justify-center p-4 relative overflow-hidden">
                    {selectedDoc ? (
                        selectedDoc.file_type.includes('image') ? (
                            <img src={`${BACKEND_URL}${selectedDoc.file_url}`} alt={selectedDoc.file_name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                        ) : selectedDoc.file_type.includes('pdf') ? (
                            <iframe src={`${BACKEND_URL}${selectedDoc.file_url}`} className="w-full h-full rounded-lg bg-white" title="PDF Preview"></iframe>
                        ) : (
                            <div className="text-center">
                                <FileText size={48} className="mx-auto text-(--text-muted) mb-4" />
                                <p className="text-white text-sm">Preview not available for this file type.</p>
                                <a href={`${BACKEND_URL}${selectedDoc.file_url}`} download className="text-(--brand-primary) hover:underline text-xs mt-2 block">Download File</a>
                            </div>
                        )
                    ) : (
                        <p className="text-(--text-muted) text-sm font-semibold uppercase tracking-widest">Select a document to preview</p>
                    )}
                </div>
            </div>
        </BaseModal>
    );
};

export default DocumentViewerModal;