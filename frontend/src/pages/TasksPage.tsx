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
  Ticket,
  History,
  FolderKanban,
  Trash2,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';
import { RaiseTicketModal } from '../components/tickets/RaiseTicketModal';
import { SubmitForReviewModal } from '../components/tasks/SubmitForReviewModal';
import { DeleteConfirmModal } from '../components/common/DeleteConfirmModal';

export function TasksPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAdminOrSuper = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [scope, setScope] = useState<'my' | 'all'>(user?.role === 'EMPLOYEE' ? 'my' : 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Super Admin 3-dropdown filters
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRaiseTicketModalOpen, setIsRaiseTicketModalOpen] = useState(false);
  const [reviewModalTask, setReviewModalTask] = useState<any | null>(null);
  const [deletingTask, setDeletingTask] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteTask = async () => {
    if (!deletingTask) return;
    try {
      setIsDeleting(true);
      await api.delete(`/tasks/${deletingTask.id}`);
      toast.success(`Task ${deletingTask.taskId || ''} deleted completely`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDeletingTask(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

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

  // 1. Fetch Users for Super Admin filter
  const { data: usersList = [] } = useQuery<any[]>({
    queryKey: ['filter-users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data || [];
    },
    enabled: isSuperAdmin,
  });

  // 2. Fetch Departments for Super Admin filter
  const { data: departmentsList = [] } = useQuery<any[]>({
    queryKey: ['filter-departments'],
    queryFn: async () => {
      const res = await api.get('/departments');
      return res.data || [];
    },
    enabled: isSuperAdmin,
  });

  // 3. Fetch Projects for Super Admin filter
  const { data: projectsList = [] } = useQuery<any[]>({
    queryKey: ['filter-projects'],
    queryFn: async () => {
      const res = await api.get('/projects');
      return res.data || [];
    },
    enabled: isSuperAdmin,
  });

  // Client-side search and filtering
  const filteredTasks = rawTasks.filter((t: any) => {
    const matchesSearch = !searchQuery || 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.taskId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = !priorityFilter || t.priority?.name === priorityFilter;

    // Super Admin Filter 1: Users (All vs Particular Employee)
    const matchesUser = !isSuperAdmin || !selectedUser || 
      t.assigneeId === selectedUser || 
      t.assignee?.id === selectedUser;

    // Super Admin Filter 2: Department (All vs Particular Department)
    const matchesDepartment = !isSuperAdmin || !selectedDepartment || 
      t.departmentId === selectedDepartment || 
      t.department?.id === selectedDepartment ||
      t.assignee?.department?.id === selectedDepartment;

    // Super Admin Filter 3: Project Name (All vs Particular Project)
    const matchesProject = !isSuperAdmin || !selectedProject || 
      t.projectId === selectedProject || 
      t.project?.id === selectedProject;

    return matchesSearch && matchesPriority && matchesUser && matchesDepartment && matchesProject;
  });

  // Column Configuration with Dot Colors and Display Labels (5 strict columns)
  const COLUMN_CONFIG: Record<string, { label: string; dotColor: string }> = {
    BACKLOG: { label: 'BACKLOG', dotColor: '#94a3b8' },         // Slate Gray
    IN_PROGRESS: { label: 'IN PROGRESS', dotColor: '#eab308' }, // Yellow / Amber
    BLOCKED: { label: 'BLOCKED', dotColor: '#ef4444' },         // Red / Blocker
    IN_REVIEW: { label: 'IN REVIEW', dotColor: '#f97316' },     // Orange
    DONE: { label: 'COMPLETED', dotColor: '#22c55e' },          // Green / Completed
  };

  // Kanban Columns: 1. Backlogs, 2. Inprogress, 3. Blocked, 4. Inreview, 5. Completed
  const kanbanColumns = ['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'];
  const groupedTasks = kanbanColumns.reduce((acc, status) => {
    acc[status] = filteredTasks.filter((t: any) => t.status?.name === status);
    return acc;
  }, {} as Record<string, any[]>);

  // Drag and drop handler with workflow restrictions
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    
    const sourceStatus = result.source.droppableId;
    const destStatus = result.destination.droppableId;
    
    if (sourceStatus === destStatus) return;

    const taskId = result.draggableId;
    const taskObj = rawTasks.find((t: any) => t.id === taskId);

    // Rule 1: Dragging to IN_REVIEW opens the Review Submission Modal
    if (destStatus === 'IN_REVIEW') {
      setReviewModalTask(taskObj || { id: taskId, taskId, title: 'Task' });
      return;
    }

    // Rule 2: Non-admins cannot drag directly to COMPLETED (DONE)
    if (destStatus === 'DONE' && !isAdminOrSuper) {
      toast.error('Tasks cannot be moved directly to Completed. Submit for review for Super Admin approval.');
      return;
    }

    // Rule 3: Non-admins cannot drag tasks out of IN_REVIEW
    if (sourceStatus === 'IN_REVIEW' && !isAdminOrSuper) {
      toast.error('Tasks in review can only be approved or rejected by a Super Admin.');
      return;
    }

    try {
      const statusObj = statuses.find((s: any) => s.name === destStatus);
      if (!statusObj) {
        toast.error(`Status ${destStatus} not found`);
        return;
      }

      await api.patch(`/tasks/${taskId}`, { statusId: statusObj.id });
      const displayLabel = COLUMN_CONFIG[destStatus]?.label || destStatus.replace('_', ' ');
      toast.success(`Task moved to ${displayLabel}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-logs'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['active-tasks-velocity'] });
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
            className="btn btn-secondary btn-sm flex items-center gap-1.5 shadow-sm border border-subtle"
            onClick={() => navigate('/tasks/logs')}
            title="View Task Status Logs & Audit Trail"
          >
            <History size={14} className="text-accent" /> View Logs
          </button>

          <button 
            className="btn btn-secondary btn-sm flex items-center gap-1.5 shadow-sm border border-subtle"
            onClick={() => setIsRaiseTicketModalOpen(true)}
            title="Raise a new support ticket"
          >
            <Ticket size={14} className="text-amber-400" /> Raise Ticket
          </button>

          <button 
            className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm font-semibold"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={14} /> Create Task
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface p-3 rounded-lg border border-subtle flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by ID, title, or customer..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input text-xs pl-8 py-1.5 w-full"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
          {/* Super Admin Exclusive Filters */}
          {isSuperAdmin && (
            <>
              {/* 1. Users Dropdown */}
              <div className="flex items-center gap-1.5">
                <Users size={13} className="text-muted shrink-0" />
                <select
                  className="input text-xs py-1.5"
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                  style={{ minWidth: '135px' }}
                  title="Filter by Employee (Super Admin)"
                >
                  <option value="">All Users</option>
                  {usersList.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Department Dropdown */}
              <div className="flex items-center gap-1.5">
                <Building size={13} className="text-muted shrink-0" />
                <select
                  className="input text-xs py-1.5"
                  value={selectedDepartment}
                  onChange={e => setSelectedDepartment(e.target.value)}
                  style={{ minWidth: '135px' }}
                  title="Filter by Department (Super Admin)"
                >
                  <option value="">All Departments</option>
                  {departmentsList.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Project Name Dropdown */}
              <div className="flex items-center gap-1.5">
                <FolderKanban size={13} className="text-muted shrink-0" />
                <select
                  className="input text-xs py-1.5"
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  style={{ minWidth: '140px' }}
                  title="Filter by Project (Super Admin)"
                >
                  <option value="">All Projects</option>
                  {projectsList.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Priority Filter */}
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

          {/* Clear Super Admin Filters button if any active */}
          {isSuperAdmin && (selectedUser || selectedDepartment || selectedProject) && (
            <button
              type="button"
              onClick={() => {
                setSelectedUser('');
                setSelectedDepartment('');
                setSelectedProject('');
              }}
              className="text-[11px] text-muted hover:text-red transition px-2 py-1 rounded bg-elevated hover:bg-red/10 border border-subtle flex items-center gap-1"
              title="Clear Super Admin Filters"
            >
              <X size={11} /> Clear
            </button>
          )}
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
                  {isSuperAdmin && <th style={{ width: '44px', textAlign: 'center' }}></th>}
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
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {task.project && (
                          <span className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
                            <FolderKanban size={11} className="shrink-0" /> {task.project.name}
                          </span>
                        )}
                        {task.ticket && (
                          <span className="text-[11px] text-muted flex items-center gap-1">
                            <Ticket size={11} className="text-amber" /> From {task.ticket.ticketId}
                          </span>
                        )}
                      </div>
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
                        {COLUMN_CONFIG[task.status?.name || '']?.label || task.status?.name?.replace('_', ' ')}
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
                    {isSuperAdmin && (
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          title="Delete Task (Super Admin)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingTask(task);
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            padding: '4px',
                            color: '#94a3b8',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={isSuperAdmin ? 8 : 7} className="text-center py-12 text-muted text-xs">
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
                    <div className="flex items-center gap-2">
                      <span 
                        className="status-dot" 
                        style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: COLUMN_CONFIG[status]?.dotColor || '#94a3b8' }}
                      />
                      <span className="font-semibold text-xs text-secondary">
                        {COLUMN_CONFIG[status]?.label || status.replace('_', ' ')}
                      </span>
                    </div>
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
                                  <div className="flex items-center gap-1">
                                    <span className={`badge badge-priority-${task.priority?.name?.toLowerCase() || 'medium'}`}>
                                      {task.priority?.name}
                                    </span>
                                    {isSuperAdmin && (
                                      <button
                                        type="button"
                                        title="Delete Task (Super Admin)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeletingTask(task);
                                        }}
                                        style={{
                                          border: 'none',
                                          background: 'transparent',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          borderRadius: '4px',
                                          padding: '2px 4px',
                                          color: '#94a3b8',
                                          transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <h4 className="text-xs font-semibold text-primary mb-2 line-clamp-2">{task.title}</h4>
                                
                                {task.project && (
                                  <div className="text-[10px] text-blue-400 font-medium flex items-center gap-1 mb-1.5 truncate">
                                    <FolderKanban size={11} className="shrink-0" />
                                    <span className="truncate">{task.project.name}</span>
                                  </div>
                                )}

                                {task.customer && (
                                  <div className="text-[10px] text-muted flex items-center gap-1 mb-2 truncate">
                                    <Building size={10} className="shrink-0" />
                                    <span className="truncate">{task.customer.name}</span>
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

                                  {task.assignee?.name ? (
                                    <span 
                                      className="text-xs font-medium text-secondary truncate max-w-[130px] text-right"
                                      title={task.assignee.name}
                                    >
                                      {task.assignee.name}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted italic">Unassigned</span>
                                  )}
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

      {/* Create Task Modal */}
      <CreateTaskModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

      {/* Raise Ticket Modal for Employees */}
      <RaiseTicketModal
        isOpen={isRaiseTicketModalOpen}
        onClose={() => setIsRaiseTicketModalOpen(false)}
      />

      {/* Submit For Review Modal */}
      <SubmitForReviewModal
        isOpen={!!reviewModalTask}
        task={reviewModalTask}
        onClose={() => setReviewModalTask(null)}
      />

      {/* Delete Confirmation Modal for Super Admin */}
      <DeleteConfirmModal
        isOpen={!!deletingTask}
        title="Delete Task"
        recordType="Task"
        recordTitle={deletingTask?.title}
        recordSubtitle={deletingTask?.taskId}
        isLoading={isDeleting}
        onClose={() => setDeletingTask(null)}
        onConfirm={handleDeleteTask}
      />
    </div>
  );
}
