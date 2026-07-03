import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { userProfileAtom } from '../../../state/userState';
import './CommandPalette.css';

interface CommandItem {
    id: string;
    icon: string;
    label: string;
    tag?: string;
    shortcut?: string[];
    href?: string;
    action?: () => void;
}

interface CommandGroup {
    key: string;
    label: string;
    items: CommandItem[];
}

// Static global actions — routes contribute their own via useCommands() in future PRs
const GLOBAL_ACTIONS: CommandItem[] = [
    {
        id: 'upload',
        icon: '↑',
        label: 'Upload .fit / .tcx / .gpx files',
        tag: 'PRIMARY',
        shortcut: ['U'],
        href: '/?upload=1',
    },
    {
        id: 'new-pipeline',
        icon: '＋',
        label: 'Create new pipeline',
        shortcut: ['N'],
        href: '/settings/pipelines/new',
    },
    {
        id: 'connections',
        icon: '↻',
        label: 'Go to connections',
        shortcut: ['C'],
        href: '/connections',
    },
];

const NAV_ITEMS: CommandItem[] = [
    { id: 'nav-dashboard',   icon: '◆', label: 'Dashboard',   tag: 'PAGE',       href: '/'                       },
    { id: 'nav-pipelines',   icon: '⇉', label: 'Pipelines',   tag: 'PAGE',       href: '/settings/pipelines'     },
    { id: 'nav-activities',  icon: '≡', label: 'Activities',  tag: 'PAGE',       href: '/activities'             },
    { id: 'nav-connections', icon: '⌬', label: 'Connections', tag: 'PAGE',       href: '/connections'            },
    { id: 'nav-settings',    icon: '⚙', label: 'Settings',    tag: 'PAGE',       href: '/settings/account'       },
];

// Admin-only quick actions — gated on the current user's isAdmin flag.
const ADMIN_ITEMS: CommandItem[] = [
    { id: 'admin-console', icon: '🛡', label: 'Admin: Console',        tag: 'ADMIN', href: '/admin'                     },
    { id: 'admin-users',   icon: '👥', label: 'Admin: Find user',      tag: 'ADMIN', href: '/admin?tab=users'           },
    { id: 'admin-runs',    icon: '🔄', label: 'Admin: Pipeline runs',  tag: 'ADMIN', href: '/admin?tab=pipeline-runs'   },
    { id: 'admin-audit',   icon: '📜', label: 'Admin: Audit log',      tag: 'ADMIN', href: '/admin?tab=audit'           },
];

function matchQuery(item: CommandItem, q: string): boolean {
    if (!q) return true;
    return item.label.toLowerCase().includes(q.toLowerCase());
}

export const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const profile = useAtomValue(userProfileAtom);
    const isAdmin = !!profile?.isAdmin;

    const groups: CommandGroup[] = [
        {
            key: 'actions',
            label: 'ACTIONS',
            items: GLOBAL_ACTIONS.filter(i => matchQuery(i, query)),
        },
        {
            key: 'jump',
            label: 'JUMP TO',
            items: NAV_ITEMS.filter(i => matchQuery(i, query)),
        },
        ...(isAdmin ? [{
            key: 'admin',
            label: 'ADMIN',
            items: ADMIN_ITEMS.filter(i => matchQuery(i, query)),
        }] : []),
    ].filter(g => g.items.length > 0);

    const flatItems = groups.flatMap(g => g.items);

    const activateItem = useCallback((item: CommandItem) => {
        onClose();
        if (item.action) {
            item.action();
        } else if (item.href) {
            if (item.href.startsWith('http')) {
                window.open(item.href, '_blank');
            } else {
                navigate(item.href);
            }
        }
    }, [onClose, navigate]);

    // Focus input on mount; close on Esc
    useEffect(() => {
        inputRef.current?.focus();

        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx(i => Math.min(i + 1, flatItems.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = flatItems[activeIdx];
                if (item) activateItem(item);
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose, flatItems, activeIdx, activateItem]);

    // Reset active index when query changes
    useEffect(() => { setActiveIdx(0); }, [query]);

    // Track running index across groups for highlight
    let runningIdx = 0;

    return (
        <>
            {/* Backdrop */}
            <div className="cmd-backdrop" onClick={onClose} aria-hidden="true" />

            {/* Panel */}
            <div
                className="cmd-palette"
                role="dialog"
                aria-label="Command palette"
                aria-modal="true"
            >
                {/* Search input */}
                <div className="cmd-palette__input-row">
                    <span className="cmd-palette__search-icon" aria-hidden="true">⌕</span>
                    <input
                        ref={inputRef}
                        className="cmd-palette__input"
                        type="text"
                        placeholder="Search or jump to…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        aria-label="Search commands"
                        aria-autocomplete="list"
                    />
                    <kbd className="cmd-palette__esc-hint">esc</kbd>
                </div>

                {/* Results */}
                <div className="cmd-palette__results" role="listbox">
                    {groups.length === 0 && (
                        <div className="cmd-palette__empty">No results for &quot;{query}&quot;</div>
                    )}
                    {groups.map(group => (
                        <div key={group.key} className="cmd-palette__group">
                            <div className="cmd-palette__group-label">{group.label}</div>
                            {group.items.map(item => {
                                const idx = runningIdx++;
                                const isActive = idx === activeIdx;
                                return (
                                    <div
                                        key={item.id}
                                        className={`cmd-palette__item${isActive ? ' cmd-palette__item--active' : ''}`}
                                        role="option"
                                        aria-selected={isActive}
                                        onClick={() => activateItem(item)}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                    >
                                        <span className="cmd-palette__item-icon" aria-hidden="true">{item.icon}</span>
                                        <span className="cmd-palette__item-label">{item.label}</span>
                                        {item.tag && (
                                            <span className="cmd-palette__item-tag">{item.tag}</span>
                                        )}
                                        {item.shortcut && (
                                            <span className="cmd-palette__item-shortcut" aria-hidden="true">
                                                {item.shortcut.map((k, j) => (
                                                    <kbd key={j} className="cmd-palette__item-kbd">{k}</kbd>
                                                ))}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Footer hints */}
                <div className="cmd-palette__footer">
                    <span>↑↓ NAVIGATE</span>
                    <span>↵ OPEN</span>
                    <span>ESC CLOSE</span>
                    <span className="cmd-palette__footer-right">⌘K · COMMAND PALETTE</span>
                </div>
            </div>
        </>
    );
};
