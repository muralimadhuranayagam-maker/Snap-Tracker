import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { 
  BarChart as BarChartIcon, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  AlertCircle,
  Clock,
  CheckCircle2,
  Bug
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export function ReportsPage() {
  const { user } = useAuthStore();
  
  // Restrict access to ADMIN and SUPER_ADMIN
  if (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="empty-state h-full flex flex-col items-center justify-center">
        <AlertCircle size={48} className="text-red mb-4" />
        <h2 className="text-2xl font-bold text-primary">Access Denied</h2>
        <p className="text-muted mt-2 text-center max-w-md">
          You do not have permission to view organizational reports. This area is restricted to Administrators.
        </p>
      </div>
    );
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports-overview'],
    queryFn: async () => {
      const res = await api.get('/reports/overview');
      return res.data;
    }
  });

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="empty-state h-full flex flex-col items-center justify-center">
        <AlertCircle size={48} className="text-red mb-4" />
        <h2 className="text-xl font-bold text-primary">Failed to load reports</h2>
        <p className="text-muted mt-2">{(error as any)?.message || 'An unknown error occurred.'}</p>
      </div>
    );
  }

  const { summary, departmentBreakdown, priorityDistribution } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Organizational Reports</h1>
          <p className="page-subtitle">Track efficiency, issue resolution, and team throughput.</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-primary mt-2">Key Metrics (Last 30 Days)</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="stat-icon-wrap bg-purple-subtle text-purple"><Bug size={18} /></div>
          </div>
          <div>
            <div className="stat-value">{summary.issuesRaised || 0}</div>
            <div className="stat-label mt-1">Issues Raised</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="stat-icon-wrap bg-blue-subtle text-blue"><Clock size={18} /></div>
          </div>
          <div>
            <div className="stat-value">{summary.avgCycleTimeHours}h</div>
            <div className="stat-label mt-1">Avg Resolution Time</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="stat-icon-wrap bg-green-subtle text-green"><CheckCircle2 size={18} /></div>
          </div>
          <div>
            <div className="stat-value">{summary.done}</div>
            <div className="stat-label mt-1">Tasks Completed</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="stat-icon-wrap bg-amber-subtle text-amber"><TrendingUp size={18} /></div>
          </div>
          <div>
            <div className="stat-value">{summary.totalHoursTaken || 0}</div>
            <div className="stat-label mt-1">Total Hours Logged</div>
          </div>
        </div>
      </div>

      {/* SLA Performance Center */}
      {data?.slaMetrics && (
        <div className="card p-4 bg-surface border-subtle">
          <div className="flex items-center justify-between border-b border-subtle pb-3 mb-3">
            <div>
              <h3 className="font-semibold text-primary text-sm flex items-center gap-1.5">
                <Clock size={16} className="text-amber" /> SLA Performance Center
              </h3>
              <p className="text-[11px] text-muted">Real-time service level agreement tracking and compliance health.</p>
            </div>
            <span className={`badge font-mono text-xs font-semibold ${
              data.slaMetrics.complianceRate >= 90 ? 'bg-green-subtle text-green' : 'bg-red-subtle text-red border border-red/30'
            }`}>
              {data.slaMetrics.complianceRate}% Compliance
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-2.5 bg-elevated/40 rounded-lg">
              <div className="text-[11px] text-muted">Total Managed Tickets</div>
              <div className="text-lg font-bold font-mono text-primary mt-0.5">{data.slaMetrics.totalTickets}</div>
            </div>
            <div className="p-2.5 bg-elevated/40 rounded-lg">
              <div className="text-[11px] text-muted">Active In-Flight SLA</div>
              <div className="text-lg font-bold font-mono text-blue mt-0.5">{data.slaMetrics.activeSla}</div>
            </div>
            <div className="p-2.5 bg-elevated/40 rounded-lg">
              <div className="text-[11px] text-muted">Delivered Within SLA</div>
              <div className="text-lg font-bold font-mono text-green mt-0.5">{data.slaMetrics.withinSlaTickets}</div>
            </div>
            <div className="p-2.5 bg-elevated/40 rounded-lg">
              <div className="text-[11px] text-muted">SLA Breaches</div>
              <div className={`text-lg font-bold font-mono mt-0.5 ${data.slaMetrics.breachedTickets > 0 ? 'text-red' : 'text-muted'}`}>
                {data.slaMetrics.breachedTickets}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid mt-4">
        {/* Department Breakdown Chart */}
        <div className="card col-span-1 lg:col-span-2 min-h-[400px] flex flex-col">
          <div className="card-header border-b border-subtle pb-4 mb-4">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <BarChartIcon size={18} />
              Tasks & Issues by Department
            </h3>
          </div>
          <div className="card-body flex-1 p-0">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={departmentBreakdown} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Bar dataKey="count" name="Total Volume" radius={[4, 4, 0, 0]}>
                  {departmentBreakdown.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Priority Distribution Chart */}
        <div className="card flex flex-col">
          <div className="card-header border-b border-subtle pb-4 mb-4">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <PieChartIcon size={18} />
              Priority Distribution
            </h3>
          </div>
          <div className="card-body flex-1 p-0 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={priorityDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {priorityDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color || '#6366f1'} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
