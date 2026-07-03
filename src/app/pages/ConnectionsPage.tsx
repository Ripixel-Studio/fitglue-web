import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/library/layout';
import { SmartNudge } from '../components/SmartNudge';
import { CardSkeleton, Button, EmptyState } from '../components/library/ui';
import { PluginIcon } from '../components/library/ui/PluginIcon';

import { useRealtimeIntegrations } from '../hooks/useRealtimeIntegrations';
import { usePluginRegistry } from '../hooks/usePluginRegistry';
import '../components/library/ui/CardSkeleton.css';
import { IntegrationManifest } from '../types/plugin';
import './ConnectionsPage.css';

interface IntegrationStatus {
    connected: boolean;
    externalUserId?: string;
    lastUsedAt?: string;
    additionalDetails?: Record<string, string>;
}

interface ConnectionTileProps {
    integration: IntegrationManifest;
    status: IntegrationStatus | undefined;
    onConnect: () => void;
    onView: () => void;
}

const ConnectionTile: React.FC<ConnectionTileProps> = ({
    integration,
    status,
    onConnect,
    onView,
}) => {
    const isConnected = status?.connected ?? false;

    const formatLastSynced = (dateStr?: string) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const lastSynced = formatLastSynced(status?.lastUsedAt);

    return (
        <div className={`conn-tile${isConnected ? ' conn-tile--connected' : ''}`}>
            <div className="conn-tile__head">
                <div className="conn-tile__identity">
                    <div className="conn-tile__icon">
                        <PluginIcon
                            icon={integration.icon}
                            iconType={integration.iconType}
                            iconPath={integration.iconPath}
                            size="medium"
                        />
                    </div>
                    <span className="conn-tile__name">{integration.name}</span>
                </div>
                <span className={`conn-tile__status ${isConnected ? 'conn-tile__status--connected' : 'conn-tile__status--disconnected'}`}>
                    {isConnected ? '✓ CONNECTED' : 'NOT CONNECTED'}
                </span>
            </div>

            <p className="conn-tile__desc">{integration.description}</p>

            {isConnected && (
                <div className="conn-tile__meta">
                    {lastSynced && (
                        <span>SYNCED: <b>{lastSynced}</b></span>
                    )}
                    {integration.actions && integration.actions.length > 0 && (
                        <span>⚡ {integration.actions.length} {integration.actions.length === 1 ? 'ACTION' : 'ACTIONS'}</span>
                    )}
                </div>
            )}

            <div className="conn-tile__foot">
                {isConnected ? (
                    <Button variant="ink" size="sm" onClick={onView}>
                        VIEW →
                    </Button>
                ) : (
                    <Button size="sm" onClick={onConnect}>
                        CONNECT
                    </Button>
                )}
            </div>
        </div>
    );
};

interface TileGroupProps {
    label: string;
    count: number;
    integrations: IntegrationManifest[];
    statuses: Record<string, IntegrationStatus | undefined> | null;
    onConnect: (i: IntegrationManifest) => void;
    onView: (i: IntegrationManifest) => void;
}

const TileGroup: React.FC<TileGroupProps> = ({ label, count, integrations, statuses, onConnect, onView }) => {
    if (integrations.length === 0) return null;
    return (
        <>
            <div className="fg-band">
                <span className="fg-band__label">{label}</span>
                <span className="fg-band__right">{count} AVAILABLE</span>
            </div>
            <div className="conn-grid">
                {integrations.map(integration => (
                    <ConnectionTile
                        key={integration.id}
                        integration={integration}
                        status={statuses?.[integration.id]}
                        onConnect={() => onConnect(integration)}
                        onView={() => onView(integration)}
                    />
                ))}
            </div>
        </>
    );
};

const ConnectionsPage: React.FC = () => {
    const navigate = useNavigate();
    const { integrations: registryIntegrations, sources, destinations, loading: registryLoading } = usePluginRegistry();
    const { integrations, loading, refresh: refreshIntegrations } = useRealtimeIntegrations();

    const handleConnect = (integration: IntegrationManifest) => {
        navigate(`/connections/${integration.id}/setup`);
    };

    const handleView = (integration: IntegrationManifest) => {
        navigate(`/connections/${integration.id}`);
    };

    const sourceIds = useMemo(() => new Set(sources.map(s => s.id)), [sources]);
    const destinationIds = useMemo(() => new Set(destinations.map(d => d.id)), [destinations]);

    const { sourceIntegrations, destinationIntegrations, accountIntegrations } = useMemo(() => {
        const sourceList: IntegrationManifest[] = [];
        const destinationList: IntegrationManifest[] = [];
        const accountList: IntegrationManifest[] = [];

        for (const integration of registryIntegrations) {
            if (sourceIds.has(integration.id)) {
                sourceList.push(integration);
            } else if (destinationIds.has(integration.id)) {
                destinationList.push(integration);
            } else {
                accountList.push(integration);
            }
        }

        return {
            sourceIntegrations: sourceList,
            destinationIntegrations: destinationList,
            accountIntegrations: accountList,
        };
    }, [registryIntegrations, sourceIds, destinationIds]);

    const statuses = integrations as Record<string, IntegrationStatus | undefined> | null;

    if (loading || registryLoading) {
        return (
            <PageLayout title="Connections">
                <div className="fg-band">
                    <span className="fg-band__label">CONNECTIONS</span>
                    <span className="fg-band__right">LOADING…</span>
                </div>
                <div className="conn-grid">
                    <div style={{ padding: '1.5rem' }}><CardSkeleton variant="integration" /></div>
                    <div style={{ padding: '1.5rem' }}><CardSkeleton variant="integration" /></div>
                    <div style={{ padding: '1.5rem' }}><CardSkeleton variant="integration" /></div>
                </div>
            </PageLayout>
        );
    }

    if (registryIntegrations.length === 0) {
        return (
            <PageLayout title="Connections">
                <EmptyState
                    icon="🔗"
                    title="NO CONNECTIONS AVAILABLE"
                    description="No integrations are available right now. Check back soon."
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="Connections"
            onRefresh={refreshIntegrations}
        >
            <SmartNudge page="connections" />

            <TileGroup
                label="SOURCES"
                count={sourceIntegrations.length}
                integrations={sourceIntegrations}
                statuses={statuses}
                onConnect={handleConnect}
                onView={handleView}
            />

            <TileGroup
                label="DESTINATIONS"
                count={destinationIntegrations.length}
                integrations={destinationIntegrations}
                statuses={statuses}
                onConnect={handleConnect}
                onView={handleView}
            />

            <TileGroup
                label="ACCOUNTS"
                count={accountIntegrations.length}
                integrations={accountIntegrations}
                statuses={statuses}
                onConnect={handleConnect}
                onView={handleView}
            />
        </PageLayout>
    );
};

export default ConnectionsPage;
