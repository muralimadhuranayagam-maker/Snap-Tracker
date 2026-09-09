import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { 
  Sparkles, AlertCircle, Activity, BrainCircuit,
  Check, X, Lightbulb, FileText,
  ChevronRight, Plus, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';

export function AIInsightsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [meetingNotes, setMeetingNotes] = useState('');
  const [parsedTasks, setParsedTasks] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  // Restrict access to ADMIN and SUPER_ADMIN
  if (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="empty-state h-full flex flex-col items-center justify-center">
        <AlertCircle size={48} className="text-red mb-4" />
        <h2 className="text-2xl font-bold text-primary">Access Denied</h2>
        <p className="text-muted mt-2 text-center max-w-md">
          AI Insights are restricted to Administrators and Super Admins.
        </p>
      </div>
    );
  }

  // Fetch Workload Analysis
  const { data: workloadData, isLoading: loadingWorkload } = useQuery({
    queryKey: ['ai-workload'],
    queryFn: async () => {
      const res = await api.post('/ai/workload-analysis');
      return res.data;
    }
  });

  // Fetch Recommendations Feed
  const { data: recommendations, isLoading: loadingRecs } = useQuery({
    queryKey: ['ai-recommendations'],
    queryFn: async () => {
      const res = await api.get('/ai/recommendations');
      return res.data;
    }
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/ai/recommendations/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-recommendations'] });
      toast.success('Recommendation dismissed');
    }
  });

  const handleParseMeeting = async () => {
    if (!meetingNotes.trim()) {
      toast.error('Please enter meeting notes to parse');
      return;
    }
    setIsParsing(true);
    try {
      const res = await api.post('/ai/parse-meeting', { text: meetingNotes });
      setParsedTasks(res.data.extractedTasks || []);
      if (res.data.extractedTasks?.length === 0) {
        toast('No actionable tasks found in notes', { icon: '🤔' });
      } else {
        toast.success(`Found ${res.data.extractedTasks.length} tasks!`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to parse meeting notes');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles className="text-purple" size={24} /> 
            Intelligence Center
          </h1>
          <p className="page-subtitle">AI-powered bottleneck detection, risk analysis, and task extraction.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        
        {/* Workload Analysis Widget */}
        <div className="card col-span-1 lg:col-span-2">
          <div className="card-header border-b border-subtle pb-3 mb-4">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <Activity size={18} className="text-blue" /> Smart Workload Analysis
            </h3>
          </div>
          <div className="card-body p-0">
            {loadingWorkload ? (
              <div className="flex justify-center p-8"><div className="spinner"></div></div>
            ) : workloadData ? (
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-primary mb-3">AI Recommendations</h4>
                  {workloadData.recommendations?.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {workloadData.recommendations.map((rec: string, i: number) => (
                        <div key={i} className="bg-amber-subtle/30 border border-amber/30 text-amber-11 p-3 rounded-lg text-sm flex items-start gap-2">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-green-subtle/30 border border-green/30 text-green-11 p-3 rounded-lg text-sm flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      <span>Team workload is balanced. No bottlenecks detected.</span>
                    </div>
                  )}
                </div>
                
                <div className="md:w-64 shrink-0 flex flex-col gap-3">
                  <h4 className="text-sm font-semibold text-primary">Workload Health</h4>
                  <div className="flex items-center justify-between p-3 bg-surface border border-subtle rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red"></div>
                      <span className="text-sm text-primary">Overloaded</span>
                    </div>
                    <span className="font-mono font-semibold">{workloadData.summary.overloaded}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-surface border border-subtle rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber"></div>
                      <span className="text-sm text-primary">High</span>
                    </div>
                    <span className="font-mono font-semibold">{workloadData.summary.high}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-surface border border-subtle rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green"></div>
                      <span className="text-sm text-primary">Healthy</span>
                    </div>
                    <span className="font-mono font-semibold">{workloadData.summary.healthy}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Meeting Notes Extractor */}
        <div className="card col-span-1 lg:col-span-2 bg-gradient-to-br from-surface to-purple-subtle/10 border-purple/20">
          <div className="card-header border-b border-purple/10 pb-3 mb-4">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <BrainCircuit size={18} className="text-purple" /> 
              Meeting Notes Task Extractor
            </h3>
          </div>
          <div className="card-body p-0 flex flex-col gap-4">
            <p className="text-sm text-muted">
              Paste raw meeting notes, transcriptions, or brain dumps below. The AI will parse the natural language and automatically extract actionable tasks.
            </p>
            <textarea
              className="input min-h-[120px] font-mono text-sm resize-y"
              placeholder="E.g., John needs to finalize the Q3 marketing budget by next Tuesday. Also, fix the login bug on the staging server immediately."
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
            ></textarea>
            
            <div className="flex justify-end">
              <button 
                className="btn bg-purple text-white hover:bg-purple-hover"
                onClick={handleParseMeeting}
                disabled={isParsing || !meetingNotes.trim()}
              >
                {isParsing ? (
                  <><div className="spinner spinner-sm"></div> Analyzing text...</>
                ) : (
                  <><Sparkles size={16} /> Parse Notes</>
                )}
              </button>
            </div>

            {/* Parsed Results */}
            {parsedTasks.length > 0 && (
              <div className="mt-4 border-t border-purple/10 pt-4">
                <h4 className="text-sm font-semibold text-primary mb-3">Extracted Action Items</h4>
                <div className="flex flex-col gap-3">
                  {parsedTasks.map((task, i) => (
                    <div key={i} className="bg-surface border border-subtle rounded-lg p-3 flex flex-col gap-2 relative group">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-primary text-sm">{task.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="badge badge-priority-high">{task.priority || 'MEDIUM'}</span>
                          <button className="btn btn-secondary btn-sm h-7 text-xs">
                            <Plus size={12} /> Create
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted">Extracted from: <span className="italic">"{task.rawText}"</span></p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active Recommendations Feed */}
        <div className="card col-span-1 lg:col-span-1">
          <div className="card-header border-b border-subtle pb-3 mb-4 flex justify-between items-center">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <Lightbulb size={18} className="text-amber" /> Active Recommendations
            </h3>
            {recommendations && (
              <span className="badge bg-surface-hover text-muted">{recommendations.length}</span>
            )}
          </div>
          <div className="card-body p-0 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
            {loadingRecs ? (
              <div className="flex justify-center p-8"><div className="spinner"></div></div>
            ) : recommendations?.length > 0 ? (
              <div className="flex flex-col gap-4">
                {recommendations.map((rec: any) => (
                  <div key={rec.id} className="bg-surface-hover border border-subtle rounded-lg p-4 group">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-sm font-semibold text-primary">{rec.title}</h4>
                      <button 
                        className="text-muted hover:text-red transition-colors opacity-0 group-hover:opacity-100"
                        title="Dismiss"
                        onClick={() => dismissMutation.mutate(rec.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-muted mb-3">{rec.message}</p>
                    {rec.task && (
                      <a href={`/tasks/${rec.task.id}`} className="inline-flex items-center gap-1 text-xs text-blue hover:underline mb-3">
                        <FileText size={12} /> View Task {rec.task.taskId} <ChevronRight size={12} />
                      </a>
                    )}
                    <div className="flex items-center gap-2 border-t border-subtle pt-3">
                      <span className="text-[10px] text-muted uppercase tracking-wider">Helpful?</span>
                      <button className="btn-icon btn-ghost w-6 h-6 rounded text-muted hover:text-green hover:bg-green-subtle">
                        <Check size={12} />
                      </button>
                      <button className="btn-icon btn-ghost w-6 h-6 rounded text-muted hover:text-red hover:bg-red-subtle">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-8 text-muted">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-green opacity-50" />
                <p>No active recommendations.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
