import React from 'react';
import './PipelineSummaryCard.css';

export interface PipelineSummaryCardProps {
    name: string;
    source: string;
    boosters: number;
    dests: [string, string][];
    onClick?: () => void;
}

export const PipelineSummaryCard: React.FC<PipelineSummaryCardProps> = ({
    name,
    source,
    boosters,
    dests,
    onClick,
}) => (
    <div
        className="pipeline-card"
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
        <div className="pipeline-card__top">
            <div className="pipeline-card__name-row">
                <span className="pipeline-card__name">{name}</span>
            </div>
            <span className="pipeline-card__count">{boosters} BOOSTER{boosters !== 1 ? 'S' : ''}</span>
        </div>
        <div className="pipeline-card__flow">
            <span className="pipeline-card__src">{source}</span>
            <span className="pipeline-card__line" />
            <span className="pipeline-card__arr">→</span>
            <span className="pipeline-card__line" />
            <span className="pipeline-card__dests">
                {dests.map(([emoji, label], i) => (
                    <span key={i} className="pipeline-card__dest">
                        <span>{emoji}</span>
                        <span>{label}</span>
                    </span>
                ))}
            </span>
        </div>
    </div>
);
