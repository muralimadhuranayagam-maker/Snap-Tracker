import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Sparkles, 
  CheckCircle2, 
  ArrowRight, 
  ShieldAlert,
  Clock,
  UserCheck
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';

export function WorkloadPage() {
  const queryClient = useQueryClient();
  const [departmentFilter, setDepartmentFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['workload', departmentFilter],
    queryFn: () => {
      const url = departmentFilter ? `/workload?departmentId=${departmentFilter}` : '/workload';
      return api.get(url).then(r => r.data);
    },
    refetchInterval: 15_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
  });

  // 1-Click Rebalance Mutation
  const reassignTaskMutation = useMutation({
    mutationFn: (data: { taskId: string; newAssigneeId: string }) =>
      api.patch(`/tasks/${data.taskId}`, { assigneeId: data.newAssigneeId }),
    onSuccess: () => {
      toast.success('Task successfully reassigned to balance capacity');
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Rebalancing failed');
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  const workloads = data?.workloads || [];
  const summary = data?.summary || { total: 0, healthy: 0, high: 0, overloaded: 0 };
  const recommendations = data?.balancingRecommendations || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Team Workload</h1>
            {summary.overloaded > 0 && (
              <span className="badge bg-red-subtle text-red border border-red/30 text-xs flex items-center gap-1 font-semibold">
                <ShieldAlert size={12} /> {summary.overloaded} Overloaded
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Capacity management, task distribution, and AI automated load-balancing engine.
          </p>
        </div>

        <select 
          className="input text-xs py-1.5"
          value={departmentFilter}
          onChange={e => setDepartmentFilter(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
          ))}
        </select>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-3.5 bg-surface border-subtle">
          <div className="text-[11px] text-muted flex items-center gap-1">
            <UserCheck size={13} className="text-accent" /> Total Monitored
          </div>
          <div className="text-xl font-bold text-primary mt-1 font-mono">{summary.total}</div>
        </div>

        <div className="card p-3.5 bg-surface border-subtle">
          <div className="text-[11px] text-muted flex items-center gap-1">
            <CheckCircle2 size={13} className="text-green" /> Healthy (0-85%)
          </div>
          <div className="text-xl font-bold text-green mt-1 font-mono">{summary.healthy}</div>
        </div>

        <div className="card p-3.5 bg-surface border-subtle">
          <div className="text-[11px] text-muted flex items-center gap-1">
            <Clock size={13} className="text-amber" /> High Load (85-100%)
          </div>
          <div className="text-xl font-bold text-amber mt-1 font-mono">{summary.high}</div>
        </div>

        <div className="card p-3.5 bg-surface border-subtle">
          <div className="text-[11px] text-muted flex items-center gap-1">
            <ShieldAlert size={13} className="text-red" /> Overloaded (&gt;100%)
          </div>
          <div className={`text-xl font-bold mt-1 font-mono ${summary.overloaded > 0 ? 'text-red' : 'text-muted'}`}>
            {summary.overloaded}
          </div>
        </div>
      </div>

      {/* AI Workload Balancing Recommendations */}
      {recommendations.length > 0 && (
        <div className="card p-5 bg-purple-subtle/20 border border-purple/30 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple text-white">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary">AI Rebalancing Engine</h3>
                <p className="text-[11px] text-muted">
                  Suggested task redistributions to protect team velocity and eliminate burnout risk.
                </p>
              </div>
            </div>
            <span className="badge bg-purple/20 text-purple border border-purple/30 text-[10px] font-mono">
              AI OPTIMIZED
            </span>
          </div>

          <div className="space-y-2.5">
            {recommendations.map((rec: any, idx: number) => (
              <div 
                key={idx}
                className="p-3 bg-surface/90 border border-subtle rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium text-primary mb-1">
                    <span>Move <strong className="font-mono text-accent">{rec.task.taskId}</strong> ({rec.task.title})</span>
                  </div>
                  <div className="text-secondary flex items-center gap-2">
                    <span className="text-red font-medium">{rec.fromUser.name} ({rec.fromUser.capacity}%)</span>
                    <ArrowRight size={12} className="text-muted" />
                    <span className="text-green font-medium">{rec.toUser.name} ({rec.toUser.capacity}%)</span>
                    <span className="text-muted ml-2">• {rec.reason}</span>
                  </div>
                </div>

                <button 
                  className="btn btn-primary btn-sm shrink-0 flex items-center gap-1.5"
                  disabled={reassignTaskMutation.isPending}
                  onClick={() => reassignTaskMutation.mutate({
                    taskId: rec.task.id,
                    newAssigneeId: rec.toUser.id
                  })}
                >
                  <CheckCircle2 size={13} />
                  <span>Apply Transfer</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workload Table */}
      <div className="card p-0 overflow-hidden bg-surface border-subtle">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
              <tr>
                <th className="p-3">Team Member</th>
                <th className="p-3">Dept</th>
                <th className="p-3">Active Tasks</th>
                <th className="p-3">Est. Remaining</th>
                <th className="p-3">Capacity %</th>
                <th className="p-3">Overdue</th>
                <th className="p-3">Blocked</th>
                <th className="p-3">Health Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {workloads.map((w: any) => (
                <tr key={w.userId} className="hover:bg-elevated/40 transition">
                  <td className="p-3">
                    <div className="font-semibold text-primary">{w.name}</div>
                    <div className="text-[11px] text-muted">{w.email}</div>
                  </td>
                  <td className="p-3 font-mono text-secondary">{w.departmentCode}</td>
                  <td className="p-3 font-mono font-medium text-primary">{w.activeTasks}</td>
                  <td className="p-3 font-mono text-secondary">{w.estimatedRemainingHours} hrs</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-elevated rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            w.status === 'OVERLOADED' ? 'bg-red' :
                            w.status === 'HIGH' ? 'bg-amber' :
                            'bg-green'
                          }`}
                          style={{ width: `${Math.min(100, w.capacityPercent)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold">{w.capacityPercent}%</span>
                    </div>
                  </td>
                  <td className="p-3 font-mono">
                    <span className={w.overdueCount > 0 ? 'text-red font-bold' : 'text-muted'}>
                      {w.overdueCount}
                    </span>
                  </td>
                  <td className="p-3 font-mono">
                    <span className={w.blockedCount > 0 ? 'text-amber font-bold' : 'text-muted'}>
                      {w.blockedCount}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`badge text-[10px] font-bold ${
                      w.status === 'OVERLOADED' ? 'bg-red-subtle text-red border border-red/30' :
                      w.status === 'HIGH' ? 'bg-amber-subtle text-amber border border-amber/30' :
                      'bg-green-subtle text-green'
                    }`}>
                      {w.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
