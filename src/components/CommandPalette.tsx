'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ScanLine,
  FileArchive,
  AlertOctagon,
  FileDown,
  UserCog,
  Command,
} from 'lucide-react';

interface CommandPaletteProps {
  onAction: (action: string) => void;
}

export default function CommandPalette({ onAction }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Listen for Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleAction = (action: string) => {
    setOpen(false);
    onAction(action);
  };

  const menuItems = [
    { id: 'scan', icon: ScanLine, label: 'New Scan', description: 'Jump to the scanner interface' },
    { id: 'bulk-upload', icon: FileArchive, label: 'Bulk / ZIP Upload', description: 'Enter advanced multi-receipt processing' },
    { id: 'missing-bn', icon: AlertOctagon, label: 'Missing BN Queue', description: 'Review receipts missing GST numbers' },
    { id: 'export-idea', icon: FileDown, label: 'Generate IDEA Export', description: 'Download CRA-compliant flat file' },
    { id: 'toggle-role', icon: UserCog, label: 'Toggle Internal Role', description: 'Switch between Owner/Employee/Accountant testing roles' },
  ];

  const filteredItems = menuItems.filter(item => 
    item.label.toLowerCase().includes(search.toLowerCase()) || 
    item.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-2xl"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/90 shadow-2xl backdrop-blur-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                <Search className="h-5 w-5 text-champagne" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search 9 Star Labs — Type a command..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-lg font-medium text-white outline-none placeholder:text-white/30"
                />
                <div className="flex items-center gap-1 text-[10px] uppercase text-white/40">
                  <span className="rounded bg-black/50 px-1 py-0.5">Esc</span> to close
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-2">
                {filteredItems.length === 0 ? (
                  <div className="py-10 text-center text-white/40">
                    <Command className="mx-auto mb-2 h-8 w-8 opacity-20" />
                    <p className="text-sm">No actions found.</p>
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAction(item.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-champagne/10 text-champagne">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white/90">{item.label}</p>
                        <p className="text-xs text-white/50">{item.description}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
