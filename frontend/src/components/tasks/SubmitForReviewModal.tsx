import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { 
  X, 
  Send, 
  UploadCloud, 
  FileText, 
  Image as ImageIcon, 
  Music, 
  Video, 
  Trash2, 
  ShieldCheck, 
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SubmitForReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: {
    id: string;
    taskId: string;
    title: string;
  } | null;
  onSuccess?: () => void;
}

export function SubmitForReviewModal({ isOpen, onClose, task, onSuccess }: SubmitForReviewModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [comment, setComment] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  if (!isOpen || !task) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon size={18} className="text-blue-400" />;
    if (file.type.startsWith('audio/')) return <Music size={18} className="text-purple-400" />;
    if (file.type.startsWith('video/')) return <Video size={18} className="text-amber-400" />;
    return <FileText size={18} className="text-emerald-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() && selectedFiles.length === 0) {
      toast.error('Please enter a comment or upload verification files.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('comment', comment.trim());
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      await api.post(`/tasks/${task.id}/submit-review`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Task submitted for Super Admin review!');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });

      // Reset state
      setComment('');
      setSelectedFiles([]);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to submit task for review');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div 
        className="bg-surface border border-subtle rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ 
          backgroundColor: 'var(--bg-surface, #18181b)',
          maxWidth: '640px',
          width: '100%'
        }}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-subtle flex justify-between items-center bg-surface-hover">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base text-primary">
                  Submit Task for Review
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {task.taskId}
                </span>
              </div>
              <p className="text-xs text-muted truncate max-w-md mt-0.5">
                {task.title}
              </p>
            </div>
          </div>

          <button 
            type="button"
            className="text-muted hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Workflow Alert Banner */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed">
              <p className="font-medium text-amber-300 mb-0.5">Super Admin Verification Required</p>
              Once submitted, the task status becomes <span className="font-semibold text-amber-400">IN REVIEW</span>. Your Super Admin will inspect the uploaded files, audio, and comments before approving completion.
            </div>
          </div>

          {/* Comment / Work Summary */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary flex items-center justify-between">
              <span>Work Summary / Review Notes <span className="text-rose-400">*</span></span>
              <span className="text-[11px] text-muted font-normal">Describe what was completed</span>
            </label>
            <textarea
              rows={4}
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Provide context, details on implementation, test results, or links for the admin..."
              className="w-full text-sm bg-surface-hover/80 border border-subtle rounded-xl p-3 text-primary placeholder:text-muted focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 transition-all resize-none"
            />
          </div>

          {/* File Upload Area */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary flex items-center justify-between">
              <span>Upload Proof / Attachments (Images, Audio, Docs, Video)</span>
              <span className="text-[11px] text-muted font-normal">{selectedFiles.length} file(s) chosen</span>
            </label>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                dragOver 
                  ? 'border-amber-500 bg-amber-500/10' 
                  : 'border-subtle hover:border-amber-500/50 hover:bg-surface-hover'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center justify-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center border border-subtle text-amber-400 mb-1">
                  <UploadCloud size={20} />
                </div>
                <p className="text-xs font-medium text-primary">
                  Click or drag & drop files here
                </p>
                <p className="text-[11px] text-muted">
                  Supports screenshots, screen recordings, voice memos (.mp3, .wav, .webm), PDFs, and documents
                </p>
              </div>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-medium text-muted uppercase tracking-wider">
                  Attachments to Upload:
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedFiles.map((file, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between px-3 py-2 bg-surface-hover/90 border border-subtle rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {getFileIcon(file)}
                        <span className="font-medium text-primary truncate max-w-[280px]">
                          {file.name}
                        </span>
                        <span className="text-[10px] text-muted font-mono shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        className="text-muted hover:text-rose-400 transition-colors p-1 rounded hover:bg-surface shrink-0"
                        title="Remove file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-subtle flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-muted hover:text-primary hover:bg-surface-hover rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || (!comment.trim() && selectedFiles.length === 0)}
              className="px-4.5 py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-all shadow-lg shadow-amber-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting Review...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Submit for Review</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
