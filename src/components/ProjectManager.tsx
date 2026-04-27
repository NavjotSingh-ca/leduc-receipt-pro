'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProjects, createProject, deleteProject } from '@/lib/services/receipts';
import type { Project } from '@/lib/types';

export default function ProjectManager() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const createMutation = useMutation({
    mutationFn: () => createProject(name.trim(), code.trim() || undefined),
    onSuccess: () => {
      setName('');
      setCode('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const handleCreate = () => {
    if (!name.trim()) { setError('Project name is required.'); return; }
    createMutation.mutate();
  };

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-champagne">Jobs & Sites</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">Project Manager</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Create job codes that link receipts to specific construction projects or sites.
        </p>
      </div>

      {/* Create form */}
      <div className="rounded-3xl border border-glass-border bg-surface p-5">
        <p className="mb-4 text-sm font-bold text-text-primary">Add New Project</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="text"
            placeholder="Project name (e.g. Westview Commercial Build)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-champagne/40"
          />
          <input
            type="text"
            placeholder="Code (e.g. WCB-01)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-champagne/40 sm:w-40"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={createMutation.isPending || !name.trim()}
            className="flex items-center gap-2 rounded-2xl bg-champagne px-4 py-3 text-sm font-bold text-obsidian transition hover:bg-champagne-dim disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Project list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-champagne" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-glass-border bg-surface py-12 text-center">
          <AlertCircle className="h-8 w-8 text-text-muted" />
          <p className="text-sm text-text-muted">No projects yet. Create your first job above.</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {projects.map((p: Project) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-4 rounded-2xl border border-glass-border bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text-primary">{p.name}</p>
                {p.code && (
                  <p className="mt-0.5 text-xs font-mono text-champagne">{p.code}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(p.id)}
                disabled={deleteMutation.isPending}
                className="rounded-xl p-2 text-text-muted transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                aria-label="Delete project"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </section>
  );
}
