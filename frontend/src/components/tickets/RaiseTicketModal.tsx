import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Sparkles, AlertTriangle, CheckCircle2, Building, Layers, Camera, Upload, Trash2, FileText } from 'lucide-react';
import { api } from '../../services/api';
import toast from 'react-hot-toast';

interface RaiseTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RaiseTicketModal({ isOpen, onClose }: RaiseTicketModalProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Customer Issue');
  const [subcategory, setSubcategory] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [severity, setSeverity] = useState('HIGH');
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string; originalName: string; size: number; mimeType: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load departments, customers, projects
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
    enabled: isOpen,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers').then(r => r.data),
    enabled: isOpen,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
    enabled: isOpen,
  });

  // Duplicate ticket detection
  const [duplicates, setDuplicates] = useState<any[]>([]);
  useEffect(() => {
    if (title.trim().length > 4) {
      const timer = setTimeout(async () => {
        try {
          const res = await api.get(`/tickets/duplicates/search?title=${encodeURIComponent(title)}`);
          setDuplicates(res.data);
        } catch {
          // ignore error
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setDuplicates([]);
    }
  }, [title]);

  // SLA Calculation preview
  const getSlaInfo = (p: string) => {
    switch (p) {
      case 'CRITICAL': return { hours: 1, label: '1 Hour Resolution SLA' };
      case 'HIGH': return { hours: 4, label: '4 Hours Resolution SLA' };
      case 'MEDIUM': return { hours: 24, label: '1 Business Day SLA' };
      default: return { hours: 72, label: '3 Business Days SLA' };
    }
  };

  const sla = getSlaInfo(priority);

  const createTicketMutation = useMutation({
    mutationFn: (data: any) => api.post('/tickets', data),
    onSuccess: (res: any) => {
      toast.success(`Ticket ${res.data.ticketId} created successfully!`);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      handleReset();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to raise ticket');
    }
  });

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAttachments(prev => [...prev, res.data]);
      toast.success(`Attached ${file.name}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || `Failed to upload ${file.name}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(uploadFile);
      e.target.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          uploadFile(file);
          toast.success('Pasted screenshot captured!');
        }
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setTitle('');
    setDescription('');
    setCategory('Customer Issue');
    setSubcategory('');
    setDepartmentId('');
    setCustomerId('');
    setProjectId('');
    setPriority('HIGH');
    setSeverity('HIGH');
    setAttachments([]);
    setDuplicates([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Ticket title is required');
      return;
    }

    createTicketMutation.mutate({
      title,
      description,
      category,
      subcategory,
      departmentId: departmentId || undefined,
      customerId: customerId || undefined,
      projectId: projectId || undefined,
      priority,
      severity,
      attachments,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header flex items-center justify-between pb-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded bg-amber-subtle text-amber">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-primary">Raise a Ticket</h3>
              <p className="text-xs text-muted">Submit an operational issue, client request, or defect</p>
            </div>
          </div>
          <button className="btn-icon btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Duplicate Detection Alert */}
          {duplicates.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-subtle border border-amber/30">
              <div className="flex items-center gap-2 text-amber text-xs font-semibold">
                <AlertTriangle size={14} /> Possible Duplicate Tickets Found:
              </div>
              <div className="mt-2 space-y-1.5">
                {duplicates.map(d => (
                  <div key={d.id} className="text-xs flex items-center justify-between bg-surface/60 p-2 rounded border border-subtle">
                    <div>
                      <span className="font-mono text-accent font-semibold mr-2">{d.ticketId}</span>
                      <span className="text-primary font-medium">{d.title}</span>
                      <span className="text-muted ml-2">({d.status})</span>
                    </div>
                    <span className="badge bg-amber/20 text-amber font-mono text-[10px]">
                      {d.similarity}% match
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-secondary block mb-1.5">
              Ticket Title <span className="text-red">*</span>
            </label>
            <input 
              type="text" 
              className="input w-full text-sm" 
              placeholder="e.g. ABC Corp API integration request or gateway timeout"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5">Category</label>
              <select 
                className="input w-full text-sm"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="Customer Issue">Customer Issue</option>
                <option value="Technical Bug">Technical Bug</option>
                <option value="Onboarding Request">Onboarding Request</option>
                <option value="Feature Requirement">Feature Requirement</option>
                <option value="Data Discrepancy">Data Discrepancy</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5">Target Department</label>
              <select 
                className="input w-full text-sm"
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
              >
                <option value="">Select Department...</option>
                {departments.map((dept: any) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5 flex items-center gap-1">
                <Building size={12} /> Customer Account
              </label>
              <select 
                className="input w-full text-sm"
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
              >
                <option value="">Select Customer (Optional)...</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5 flex items-center gap-1">
                <Layers size={12} /> Linked Project
              </label>
              <select 
                className="input w-full text-sm"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">Select Project (Optional)...</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5">Priority</label>
              <select 
                className="input w-full text-sm"
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option value="CRITICAL">CRITICAL (1h SLA)</option>
                <option value="HIGH">HIGH (4h SLA)</option>
                <option value="MEDIUM">MEDIUM (24h SLA)</option>
                <option value="LOW">LOW (72h SLA)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5">Severity</label>
              <select 
                className="input w-full text-sm"
                value={severity}
                onChange={e => setSeverity(e.target.value)}
              >
                <option value="CRITICAL">CRITICAL - System Blocker</option>
                <option value="HIGH">HIGH - Major Impact</option>
                <option value="MEDIUM">MEDIUM - Standard Degraded</option>
                <option value="LOW">LOW - Minor Inconvenience</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary block mb-1.5">
              Description & Details
            </label>
            <textarea 
              rows={4}
              className="input w-full text-sm"
              placeholder="Provide context, reproduction steps, customer notes, or error logs..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              onPaste={handlePaste}
            />
          </div>

          {/* Screenshot & Attachment Section */}
          <div className="space-y-2" onPaste={handlePaste}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-secondary flex items-center gap-1.5">
                <Camera size={14} className="text-accent" />
                <span>Screenshots & Attachments</span>
              </label>
              <span className="text-[11px] text-muted">Supports PNG, JPG, GIF, WebP & Clipboard Paste (Ctrl+V)</span>
            </div>

            {/* Dropzone */}
            <div 
              className="border-2 border-dashed border-subtle hover:border-accent/50 rounded-lg p-3 text-center transition cursor-pointer bg-surface/40 hover:bg-elevated/60"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  Array.from(e.dataTransfer.files).forEach(uploadFile);
                }
              }}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                multiple 
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleFileSelect} 
              />
              <div className="flex flex-col items-center justify-center gap-1">
                {isUploading ? (
                  <div className="flex items-center gap-2 text-xs text-accent py-1">
                    <div className="spinner spinner-sm" /> Uploading screenshot...
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-xs font-medium text-primary">
                      <Upload size={14} className="text-accent" />
                      <span>Click to upload screenshot, or drag & drop</span>
                    </div>
                    <p className="text-[11px] text-muted">You can also copy any screenshot and paste (Ctrl + V) directly here</p>
                  </>
                )}
              </div>
            </div>

            {/* Attached Thumbnails Preview */}
            {attachments.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative group p-2 rounded-lg border border-subtle bg-elevated flex items-center gap-2">
                    {att.mimeType.startsWith('image/') ? (
                      <img 
                        src={att.url} 
                        alt={att.originalName} 
                        className="w-10 h-10 object-cover rounded border border-subtle flex-shrink-0" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-surface border border-subtle flex items-center justify-center text-muted flex-shrink-0">
                        <FileText size={18} />
                      </div>
                    )}
                    <div className="overflow-hidden text-left flex-1 min-w-0">
                      <div className="text-xs font-medium text-primary truncate" title={att.originalName}>
                        {att.originalName}
                      </div>
                      <div className="text-[10px] text-muted font-mono">
                        {(att.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-icon btn-ghost btn-xs text-red hover:bg-red/10 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachment(idx);
                      }}
                      title="Remove attachment"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI SLA & Triage Insight Card */}
          <div className="p-3 rounded-lg bg-surface border border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-purple" />
              <div>
                <div className="text-xs font-semibold text-primary">Automated SLA Policy</div>
                <div className="text-[11px] text-muted">
                  Guaranteed response SLA: <span className="text-primary font-medium">{sla.label}</span>
                </div>
              </div>
            </div>
            <div className="badge bg-purple-subtle text-purple border border-purple/30 text-xs font-mono">
              AI Triage Active
            </div>
          </div>

          <div className="modal-footer flex items-center justify-end gap-2 pt-3 border-t border-subtle">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary flex items-center gap-1.5"
              disabled={createTicketMutation.isPending}
            >
              {createTicketMutation.isPending ? (
                <>
                  <div className="spinner spinner-sm" /> Raising Ticket...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Submit Ticket
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
