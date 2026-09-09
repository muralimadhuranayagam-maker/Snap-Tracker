import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { 
  List, 
  LayoutGrid, 
  Plus, 
  Search,
  Clock, 
  MessageSquare,
  Users,
  UserCheck,
  Building,
  Ticket
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';

export function TasksPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAdminOrSuper = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [scope, setScope] = useState<'my' | 'all'>(user?.role === 'EMPLOYEE' ? 'my' : 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Fetch Tasks with scope
  const { data: rawTasks = [], isLoading } = useQuery({
    queryKey: ['tasks', scope, user?.id],
    queryFn: async () => {
      const params: any = { limit: 150 };
      if (scope === 'my' && user?.id) {
        params.assigneeId = user.id;
      }
      const res = await api.get('/tasks', { params });
      return res.data?.tasks || res.data?.data || [];
    }
  });

  // Fetch status options
  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: async () => {
      const res = await api.get('/tasks/meta/statuses');
      return res.data?.statuses || [];
    }
  });

  // Client-side search and priority filtering
  const filteredTasks = rawTasks.filter((t: any) => {
    const matchesSearch = !searchQuery || 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.taskId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = !priorityFilter || t.priority?.name === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  // Kanban Columns
  const kanbanColumns = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
  const groupedTasks = kanbanColumns.reduce((acc, status) => {
    acc[status] = filteredTasks.filter((t: any) => t.status?.name === status);
    return acc;
  }, {} as Record<string, any[]>);

  // Drag and drop handler with correct PATCH endpoint and query invalidation
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    
    const sourceStatus = result.source.droppableId;
    const destStatus = result.destination.droppableId;
    
    if (sourceStatus === destStatus) return;

    const taskId = result.draggableId;
    try {
      const statusObj = statuses.find((s: any) => s.name === destStatus);
      if (!statusObj) {
        toast.error(`Status ${destStatus} not found`);
        return;
      }

      await api.patch(`/tasks/${taskId}`, { statusId: statusObj.id });
      toast.success(`Task moved to ${destStatus.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update task status');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">
              {scope === 'all' ? 'All Team Tasks' : 'My Assigned Tasks'}
            </h1>
            <span className="badge bg-elevated font-mono text-xs text-muted">
              {filteredTasks.length} tasks
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Manage deliverables, drag across workflow stages, and track progress.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Scope Toggle for Admins */}
          {isAdminOrSuper && (
            <div className="flex bg-elevated rounded-lg p-0.5 border border-subtle text-xs">
              <button
                className={`px-2.5 py-1 rounded-md transition font-medium ${scope === 'all' ? 'bg-surface shadow-sm text-primary' : 'text-muted hover:text-primary'}`}
                onClick={() => setScope('all')}
              >
                <span className="flex items-center gap-1.5"><Users size={12} /> Team Tasks</span>
              </button>
              <button
                className={`px-2.5 py-1 rounded-md transition font-medium ${scope === 'my' ? 'bg-surface shadow-sm text-primary' : 'text-muted hover:text-primary'}`}
                onClick={() => setScope('my')}
              >
                <span className="flex items-center gap-1.5"><UserCheck size={12} /> My Tasks</span>
              </button>
            </div>
          )}

          {/* View Toggle */}
          <div className="flex bg-elevated rounded-lg p-0.5 border border-subtle">
            <button 
              className={`p-1.5 rounded-md transition ${viewMode === 'kanban' ? 'bg-surface shadow-sm text-primary' : 'text-muted hover:text-primary'}`}
              onClick={() => setViewMode('kanban')}
              title="Kanban Board View"
            >
              <LayoutGrid size={15} />
            </button>
            <button 
              className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-surface shadow-sm text-primary' : 'text-muted hover:text-primary'}`}
              onClick={() => setViewMode('list')}
              title="List Table View"
            >
              <List size={15} />
            </button>
          </div>

          <button 
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={14} /> Create Task
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface p-3 rounded-lg border border-subtle">
        <div className="relative flex-1 w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by ID, title, or customer..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input text-xs pl-8 py-1.5 w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            className="input text-xs py-1.5"
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Main Content: List or Kanban */}
      {viewMode === 'list' ? (
        <div className="card overflow-hidden">
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Task ID</th>
                  <th>Title</th>
                  <th>Customer</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task: any) => (
                  <tr 
                    key={task.id} 
                    className="cursor-pointer hover:bg-surface-hover transition-colors"
                    onClick={() => navigate(`/tasks/${task.id}`)}
                  >
                    <td className="font-mono text-xs font-semibold text-accent">{task.taskId}</td>
                    <td>
                      <div className="font-medium text-primary text-sm">{task.title}</div>
                      {task.ticket && (
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                          <Ticket size={11} className="text-amber" /> From {task.ticket.ticketId}
                        </div>
                      )}
                    </td>
                    <td>
                      {task.customer ? (
                        <span className="badge bg-elevated text-secondary text-xs flex items-center gap-1">
                          <Building size={11} className="text-muted" /> {task.customer.name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {task.assignee ? (
                        <div className="flex items-center gap-2">
                          <div className="avatar avatar-sm bg-accent text-xs">
                            {task.assignee.avatar ? <img src={task.assignee.avatar} alt="" /> : task.assignee.name.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-secondary">{task.assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted italic">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-status-${task.status?.name?.toLowerCase() || 'backlog'}`}>
                        {task.status?.name?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-priority-${task.priority?.name?.toLowerCase() || 'medium'}`}>
                        {task.priority?.name}
                      </span>
                    </td>
                    <td className="text-xs text-muted">
                      {task.dueDate ? (
                        <span className={new Date(task.dueDate) < new Date() && task.status?.name !== 'DONE' ? 'text-red font-semibold' : ''}>
                          {format(new Date(task.dueDate), 'MMM d, yyyy')}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}

                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted text-xs">
                      No tasks found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="kanban-board">
            {kanbanColumns.map(status => {
              const columnTasks = groupedTasks[status] || [];
              return (
                <div key={status} className="kanban-col">
                  <div className="kanban-col-header">
                    <span className="font-semibold text-xs text-secondary">{status.replace('_', ' ')}</span>
                    <span className="kanban-col-count">{columnTasks.length}</span>
                  </div>
                  
                  <Droppable droppableId={status}>
                    {(provided) => (
                      <div 
                        className="kanban-col-body"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        {columnTasks.map((task: any, index: number) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`kanban-card cursor-pointer hover:border-accent/50 transition-colors ${snapshot.isDragging ? 'shadow-lg border-accent scale-[1.02]' : ''}`}
                                style={provided.draggableProps.style}
                                onClick={() => navigate(`/tasks/${task.id}`)}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[11px] font-mono font-semibold text-accent">{task.taskId}</span>
                                  <span className={`badge badge-priority-${task.priority?.name?.toLowerCase() || 'medium'}`}>
                                    {task.priority?.name}
                                  </span>
                                </div>
                                <h4 className="text-xs font-semibold text-primary mb-2 line-clamp-2">{task.title}</h4>
                                
                                {task.customer && (
                                  <div className="text-[10px] text-muted flex items-center gap-1 mb-2">
                                    <Building size={10} /> {task.customer.name}
                                  </div>
                                )}

                                <div className="flex items-center justify-between mt-auto pt-2 border-t border-subtle">
                                  <div className="flex items-center gap-2 text-[11px] text-muted">
                                    {task.dueDate && (
                                      <div className={`flex items-center gap-1 ${new Date(task.dueDate) < new Date() && task.status?.name !== 'DONE' ? 'text-red font-medium' : ''}`}>
                                        <Clock size={11} />
                                        {format(new Date(task.dueDate), 'MMM d')}
                                      </div>
                                    )}
                                    {task._count?.comments > 0 && (
                                      <div className="flex items-center gap-1">
                                        <MessageSquare size={11} />
                                        {task._count.comments}
                                      </div>
                                    )}
                                  </div>

                                  <div className="avatar avatar-sm bg-accent text-[11px]" title={task.assignee?.name || 'Unassigned'}>
                                    {task.assignee?.avatar ? (
                                      <img src={task.assignee.avatar} alt="" />
                                    ) : (
                                      task.assignee?.name?.charAt(0) || '?'
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      <CreateTaskModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />
    </div>
  );
}
