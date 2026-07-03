import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { useRealtimeInputs } from '../hooks/useRealtimeInputs';
import { useRealtimeStats } from '../hooks/useRealtimeStats';
import { useRealtimePipelines } from '../hooks/useRealtimePipelines';
import { useRealtimeIntegrations } from '../hooks/useRealtimeIntegrations';
import { usePluginRegistry } from '../hooks/usePluginRegistry';
import { pipelineRunsAtom } from '../state/activitiesState';
import { userAtom } from '../state/authState';
import { PageLayout } from '../components/library/layout';
import { DashboardLayout, DashboardBody, DashboardCol } from '../components/library/layout/DashboardLayout';
import { DashboardHeading, Gr } from '../components/library/ui/DashboardHeading';
import { DashboardPlanBand } from '../components/library/ui/DashboardPlanBand';
import { useToast } from '../components/library/ui/Toast/Toast';

import { WelcomeBanner } from '../components/onboarding/WelcomeBanner';
import { PWAInstallBanner } from '../components/dashboard/PWAInstallBanner';
import { IntegrationsSummary } from '../state/integrationsState';
import { useUser } from '../hooks/useUser';
import { client } from '../../shared/api/client';
import { getEffectiveTier, TIER_ATHLETE } from '../utils/tier';
import { PipelinesSection } from '../components/dashboard/PipelinesSection';
import { RecentRunsSection } from '../components/dashboard/RecentRunsSection';
import { ActionRequiredSection } from '../components/dashboard/ActionRequiredSection';
import { UploadSection } from '../components/dashboard/UploadSection';
import { GuidedTour } from '../components/onboarding/GuidedTour';
import { GuidedTourProvider, useGuidedTour } from '../hooks/useGuidedTour';
import './DashboardPage.css';

const ONBOARDING_COMPLETE_KEY = 'fitglue_onboarding_complete';

function getEyebrow(): string {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `DASHBOARD · ${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} · ${time}`;
}

const DashboardPageInner: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { info } = useToast();
    const [onboardingComplete, setOnboardingComplete] = useState(() => {
        return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
    });
    const { startTour } = useGuidedTour();

    const firebaseUser = useAtomValue(userAtom);
    const { integrations: registryIntegrations, loading: registryLoading } = usePluginRegistry();
    const { loading: inputsLoading } = useRealtimeInputs();
    const { integrations } = useRealtimeIntegrations();
    const { pipelines } = useRealtimePipelines();
    const [pipelineRuns] = useAtom(pipelineRunsAtom);

    const { user } = useUser();
    const isAthlete = user ? getEffectiveTier(user) === TIER_ATHLETE : false;
    const [hasShowcaseProfile, setHasShowcaseProfile] = useState(false);

    const fetchShowcaseStatus = useCallback(async () => {
        if (!isAthlete) return;
        try {
            const { data } = await client.GET('/users/me/showcase-management/profile');
            const profile = (data as Record<string, unknown>)?.profile;
            setHasShowcaseProfile(!!profile);
        } catch {
            // non-critical
        }
    }, [isAthlete]);

    useEffect(() => { fetchShowcaseStatus(); }, [fetchShowcaseStatus]);

    useRealtimeStats(true);

    const [heroStats, setHeroStats] = useState<{
        activitiesThisMonth: number;
        uploadsThisMonth: number;
        activitiesThisWeek: number;
        uploadsThisWeek: number;
        currentStreakDays: number;
    } | null>(null);

    useEffect(() => {
        client.GET('/users/me/activities/stats').then(({ data }) => {
            if (!data) return;
            setHeroStats({
                activitiesThisMonth: data.activitiesThisMonth ?? 0,
                uploadsThisMonth: data.uploadsThisMonth ?? 0,
                activitiesThisWeek: data.activitiesThisWeek ?? 0,
                uploadsThisWeek: data.uploadsThisWeek ?? 0,
                currentStreakDays: data.currentStreakDays ?? 0,
            });
        }).catch(() => { /* non-critical */ });
    }, []);

    useEffect(() => {
        if (searchParams.get('redirected') === 'true') {
            info('Page Not Found', "The page you visited doesn't exist — we've brought you back home.");
            searchParams.delete('redirected');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams, info]);

    const isLoading = inputsLoading || registryLoading;

    const connectedCount = registryIntegrations.filter(
        ri => integrations?.[ri.id as keyof IntegrationsSummary]?.connected
    ).length;
    const hasConnections = connectedCount > 0;
    const hasPipelines = pipelines.length > 0;
    const hasSyncs = pipelineRuns.length > 0;
    const allOnboardingComplete = hasConnections && hasPipelines && hasSyncs
        && (!isAthlete || hasShowcaseProfile);

    useEffect(() => {
        if (!isLoading && allOnboardingComplete && !onboardingComplete) {
            localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
            setOnboardingComplete(true);
        }
    }, [isLoading, allOnboardingComplete, onboardingComplete]);

    const firstName = firebaseUser?.displayName?.split(' ')[0] || 'there';
    const activePipelines = pipelines.filter((p: { disabled?: boolean }) => !p.disabled).length;
    const tier = isAthlete ? 'ATHLETE' as const : 'FREE' as const;

    return (
        <PageLayout loading={isLoading} fullWidth>
            {/* Pre-chrome system messages — above DashboardLayout heading */}
            {!onboardingComplete && !isLoading && !allOnboardingComplete && !hasConnections && (
                <div className="dashboard-first-run">
                    <div className="dashboard-first-run__banner">
                        <div>
                            <div className="dashboard-first-run__step">✦ WELCOME · STEP 1 OF 4</div>
                            <div className="dashboard-first-run__heading">Pick a source to start.</div>
                            <div className="dashboard-first-run__sub">CONNECT → BUILD A PIPELINE → SYNC ONCE → SHARE OR SIT ON IT</div>
                        </div>
                        <button className="fg-button" onClick={() => navigate('/connections')}>
                            CONNECT FIRST SOURCE →
                        </button>
                    </div>
                    <div className="dashboard-first-run__grid">
                        <div className="dashboard-first-run__card">
                            <div className="dashboard-first-run__card-icon">🔗</div>
                            <div className="dashboard-first-run__card-title">No connections yet</div>
                            <div className="dashboard-first-run__card-body">Hook in Strava, Hevy, Fitbit, Polar — wherever your activities live.</div>
                            <button className="fg-button" onClick={() => navigate('/connections')}>CONNECT A SOURCE →</button>
                        </div>
                        <div className="dashboard-first-run__card dashboard-first-run__card--dim">
                            <div className="dashboard-first-run__card-icon">🔀</div>
                            <div className="dashboard-first-run__card-title">No pipelines yet</div>
                            <div className="dashboard-first-run__card-body">Pipelines route activities through boosters into destinations.</div>
                            <div className="dashboard-first-run__card-hint">DO STEP 1 FIRST →</div>
                        </div>
                        <div className="dashboard-first-run__card dashboard-first-run__card--dim">
                            <div className="dashboard-first-run__card-icon">✨</div>
                            <div className="dashboard-first-run__card-title">No activities yet</div>
                            <div className="dashboard-first-run__card-body">Your enriched activity feed shows up here once syncs start.</div>
                            <div className="dashboard-first-run__card-hint">UPLOAD A .FIT FILE TO TRY →</div>
                        </div>
                    </div>
                </div>
            )}
            {!onboardingComplete && !isLoading && !allOnboardingComplete && hasConnections && (
                <WelcomeBanner
                    hasConnections={hasConnections}
                    hasPipelines={hasPipelines}
                    hasSyncs={hasSyncs}
                    isAthlete={isAthlete}
                    hasShowcaseProfile={hasShowcaseProfile}
                    onStartTour={startTour}
                />
            )}
            {(onboardingComplete || allOnboardingComplete) && <PWAInstallBanner />}

            <DashboardLayout>
                <DashboardHeading
                    eyebrow={getEyebrow()}
                    title={<>Hey {firstName} <Gr>—</Gr> Welcome back</>}
                    stats={[
                        { n: heroStats?.activitiesThisMonth ?? '—', l: 'SYNCED THIS MONTH', tone: 'gradient' },
                        { n: heroStats?.uploadsThisMonth ?? '—', l: 'POSTS THIS MONTH' },
                        { n: heroStats?.activitiesThisWeek ?? '—', l: 'SYNCED THIS WEEK' },
                        { n: heroStats?.uploadsThisWeek ?? '—', l: 'POSTS THIS WEEK' },
                        { n: activePipelines, l: 'ACTIVE PIPELINES' },
                        { n: heroStats ? `${heroStats.currentStreakDays}d 🔥` : '—', l: 'DAY STREAK' },
                    ]}
                />
                <DashboardPlanBand
                    tier={tier}
                    onManage={() => navigate('/settings/subscription')}
                />
                <DashboardBody>
                    <DashboardCol>
                        <ActionRequiredSection />
                        <UploadSection />
                    </DashboardCol>
                    <DashboardCol>
                        <PipelinesSection />
                    </DashboardCol>
                    <DashboardCol>
                        <RecentRunsSection />
                    </DashboardCol>
                </DashboardBody>
            </DashboardLayout>

            <GuidedTour />
        </PageLayout>
    );
};

const DashboardPage: React.FC = () => (
    <GuidedTourProvider>
        <DashboardPageInner />
    </GuidedTourProvider>
);

export default DashboardPage;
