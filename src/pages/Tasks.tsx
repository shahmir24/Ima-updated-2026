
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TaskCard from '@/components/tasks/TaskCard';
import MeetingModal from '@/components/tasks/MeetingModal';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import PageHeader from '@/components/layout/PageHeader';
import PageWorkspace from '@/components/layout/PageWorkspace';
import type { TaskRow } from '@/hooks/use-tasks';
import { useTaskSource } from '@/hooks/use-task-source';
import type { TaskFormInput } from '@/components/tasks/MeetingModal';
import GuestTasksNotice from '@/components/tasks/GuestTasksNotice';
import GuestBodyDoublePreview from '@/components/home/GuestBodyDoublePreview';
import { LOG_IN_PATH, SIGN_UP_PATH } from '@/lib/auth-entry';

/** '14:00:00' -> '2:00 PM'. Empty string when no time is set. */
const formatTime = (value: string | null) => {
  if (!value) return '';
  const [hours, minutes] = value.split(':');
  return new Date(2000, 0, 1, Number(hours), Number(minutes)).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/** Local YYYY-MM-DD, so "today" matches the user's calendar, not UTC. */
const toLocalISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const describeDate = (scheduledDate: string) => {
  if (scheduledDate === toLocalISODate(new Date())) return 'Today';
  return new Date(`${scheduledDate}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

const describeTimeRange = (task: TaskRow) => {
  const start = formatTime(task.start_time);
  const end = formatTime(task.end_time);
  if (start && end) return `${start} - ${end}`;
  return start || 'No time set';
};

const toTitleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** A list meant to be read, so it stays narrower than the card hubs. */
const WORKSPACE = 'max-w-4xl';

const Tasks = () => {
  const navigate = useNavigate();

  /**
   * The same task-context contract Home uses: the id travels in the URL and
   * the destination resolves it against the user's own tasks, so RLS still
   * applies and nothing about the task itself is carried across. Reused rather
   * than reimplemented - Focus and Body Double already read ?task= and do not
   * care which screen sent them.
   */
  const withTask = (path: string, taskId: string) =>
    `${path}?task=${encodeURIComponent(taskId)}`;
  const [activeTab, setActiveTab] = useState<'all' | 'completed'>('all');
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  /** null = the form is creating; a row = the form is editing that row. */
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateString = today.toLocaleDateString('en-US', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  const {
    mode,
    tasks,
    isPending,
    isError,
    error,
    refetch,
    create: createTask,
    update: updateTask,
    remove: deleteTask,
    toggle: toggleCompleted
  } = useTaskSource();

  /**
   * Guest Mode: the same screen over the guest store. Back goes Home rather
   * than to Productivity (which needs an account), and "I'm stuck" opens the
   * same account prompt Home uses instead of Body Double.
   */
  const isGuest = mode === 'guest';
  /** The title of the task the Body Double preview is open for, or null. */
  const [guestStuckTitle, setGuestStuckTitle] = useState<string | null>(null);
  const goToSignUp = () => navigate(SIGN_UP_PATH);
  const goToLogIn = () => navigate(LOG_IN_PATH);
  const handleStuck = (task: TaskRow) => {
    if (isGuest) {
      setGuestStuckTitle(task.title);
      return;
    }
    navigate(withTask('/body-double', task.id));
  };

  const filteredTasks = tasks.filter(task =>
    activeTab === 'all' ? true : task.completed
  );

  const handleCompleteTask = (task: TaskRow) => {
    toggleCompleted.run(task).catch(() => { /* surfaced by mutation state */ });
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask.run(taskId).catch(() => { /* surfaced by mutation state */ });
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setShowMeetingModal(true);
  };

  const openEditModal = (task: TaskRow) => {
    setEditingTask(task);
    setShowMeetingModal(true);
  };

  const closeModal = () => {
    setShowMeetingModal(false);
    setEditingTask(null);
  };

  /**
   * One form, two writes. Editing goes through the task source's update, which
   * for a signed-in user is the existing useUpdateTask,
   * which is an UPDATE scoped to id + user_id, so the row is changed in place
   * rather than duplicated. Only the three fields the form owns are sent:
   * completed, completed_at, tag, description and end_time are left alone.
   */
  const handleSubmitTask = async (input: TaskFormInput) => {
    if (editingTask) {
      await updateTask.run({
        id: editingTask.id,
        changes: {
          title: input.title,
          scheduled_date: input.scheduled_date,
          start_time: input.start_time,
          importance: input.importance
        }
      });
      return;
    }
    await createTask.run(input);
  };

  const mutationError =
    createTask.error || updateTask.error || deleteTask.error || toggleCompleted.error;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
      <PageHeader title="Today's Tasks" backPath={isGuest ? '/' : '/productivity'} width={WORKSPACE} />

      {isGuest && (
        <PageWorkspace width={WORKSPACE} className="mb-4">
          <GuestTasksNotice onCreateAccount={goToSignUp} />
        </PageWorkspace>
      )}

      {/* Sub-header */}
      <PageWorkspace width={WORKSPACE} className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-white text-base">{dayName}, {dateString}</span>
          <div className="flex items-center gap-3">
            <Button 
              onClick={openCreateModal}
              style={{ backgroundColor: '#2f74db' }}
              className="hover:opacity-90 text-white rounded-full h-11 px-4 py-2 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Task
            </Button>
          </div>
        </div>
      </PageWorkspace>

      {/* Filter Tabs */}
      <PageWorkspace width={WORKSPACE} className="mb-6">
        <div className="flex gap-2">
          <Button
            onClick={() => setActiveTab('all')}
            className={`rounded-full h-11 px-6 py-2 flex items-center gap-2 ${
              activeTab === 'all' 
                ? 'text-white' 
                : 'bg-gray-600 text-white hover:bg-gray-500'
            }`}
            style={activeTab === 'all' ? { background: 'linear-gradient(to right, #2f74db, #2f74db)' } : {}}
          >
            All
            <Badge variant="secondary" className="bg-white/20 text-white text-xs">
              {tasks.filter(t => !t.completed).length}
            </Badge>
          </Button>
          <Button
            onClick={() => setActiveTab('completed')}
            className={`rounded-full h-11 px-6 py-2 flex items-center gap-2 ${
              activeTab === 'completed' 
                ? 'text-white' 
                : 'bg-gray-600 text-white hover:bg-gray-500'
            }`}
            style={activeTab === 'completed' ? { background: 'linear-gradient(to right, #2f74db, #2f74db)' } : {}}
          >
            Completed
            <Badge variant="secondary" className="bg-white/20 text-white text-xs">
              {tasks.filter(t => t.completed).length}
            </Badge>
          </Button>
        </div>
      </PageWorkspace>

      {/* Task Cards */}
      <main className="flex-1">
        <PageWorkspace width={WORKSPACE} className="space-y-4">
          {mutationError && (
            <p className="text-red-300 text-sm text-center py-2">
              {(mutationError as Error).message}
            </p>
          )}

          {isPending && (
            <p className="text-white/60 text-sm text-center py-8">Loading your tasks…</p>
          )}

          {isError && (
            <div className="text-center py-8 space-y-3">
              <p className="text-red-300 text-sm">
                {(error as Error)?.message || 'Could not load your tasks.'}
              </p>
              <Button
                onClick={() => refetch()}
                className="rounded-full h-11 px-6 py-2 text-white"
                style={{ backgroundColor: '#2f74db' }}
              >
                Try again
              </Button>
            </div>
          )}

          {!isPending && !isError && filteredTasks.length === 0 && (
            <p className="text-white/60 text-sm text-center py-8">
              {activeTab === 'completed'
                ? 'Nothing completed yet.'
                : 'No tasks yet. Tap “New Task” to add one.'}
            </p>
          )}

          {/* onStart/onStuck are navigations rather than mutations, so unlike
              the other actions they are deliberately not gated on `busy`: a
              delete in flight elsewhere must not make them dead. */}
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={{
                id: task.id,
                title: task.title,
                description: task.description ?? '',
                time: describeTimeRange(task),
                dateLabel: describeDate(task.scheduled_date),
                tag: toTitleCase(task.tag),
                completed: task.completed
              }}
              busy={toggleCompleted.isPending || deleteTask.isPending || updateTask.isPending}
              onComplete={() => handleCompleteTask(task)}
              onDelete={() => handleDeleteTask(task.id)}
              onEdit={() => openEditModal(task)}
              onStart={() => navigate(withTask('/focus', task.id))}
              onStuck={() => handleStuck(task)}
            />
          ))}
        </PageWorkspace>
      </main>

      {/* Task form — create and edit */}
      <MeetingModal
        /**
         * The form returns null while closed but stays mounted, so its state
         * outlives a close. Keying it per task remounts it on every open, which
         * is what makes edit A -> edit B -> New Task show the right values.
         */
        key={editingTask?.id ?? 'new'}
        isOpen={showMeetingModal}
        task={editingTask}
        onClose={closeModal}
        onSubmit={handleSubmitTask}
        isSaving={createTask.isPending || updateTask.isPending}
      />

      {isGuest && (
        <GuestBodyDoublePreview
          taskTitle={guestStuckTitle}
          onClose={() => setGuestStuckTitle(null)}
          onCreateAccount={goToSignUp}
          onLogIn={goToLogIn}
        />
      )}

      <BottomNavigation />
    </div>
  );
};

export default Tasks;
