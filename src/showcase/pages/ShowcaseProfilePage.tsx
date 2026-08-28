import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import publicClient from '../../shared/api/public-client';
import type { components } from '../../shared/api/schema-public';
import ProfileHero from '../components/layout/ProfileHero';
import LifetimeStats from '../components/layout/LifetimeStats';
import MedalWall from '../components/layout/MedalWall';
import ConsistencyHeatmap from '../components/layout/ConsistencyHeatmap';
import ZoneBar from '../components/layout/ZoneBar';
import RouteMosaic from '../components/layout/RouteMosaic';
import ActivityGrid from '../components/layout/ActivityGrid';
import { PhotoGallery } from '../components/PhotoGallery';
import { useShowcaseMeta } from '../utils/useShowcaseMeta';
import { useShowcaseOwner } from '../utils/useShowcaseOwner';
import { useInfiniteScroll } from '../utils/useInfiniteScroll';
import { recordShowcaseView } from '../utils/recordView';
import { roundupTypeClass } from '../utils/roundup';
import ShowcaseNotFound from '../components/ShowcaseNotFound';
import { ViewCountBadge } from '../components/ViewCountBadge';
import client from '../../shared/api/client';
import type { components as clientComponents } from '../../shared/api/schema-client';
import { isNativeApp } from '../../shared/nativeBridge';

type ShowcaseProfile = components['schemas']['ShowcaseProfile'];
type ShowcaseProfileEntry = components['schemas']['ShowcaseProfileEntry'];
type ShowcaseLink = components['schemas']['ShowcaseLink'];
type ShowcaseRoundup = components['schemas']['ShowcaseRoundup'];

function roundupPeriodLabel(periodKey: string): string {
  if (periodKey.startsWith('week-')) {
    const [, week, year] = periodKey.split('-');
    return `Week ${parseInt(week, 10)} · ${year}`;
  }
  if (periodKey.startsWith('month-')) {
    const [, month, year] = periodKey.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
  }
  if (periodKey.startsWith('year-')) return periodKey.replace('year-', '');
  return periodKey;
}

function roundupTypeLabel(periodKey: string): string {
  if (periodKey.startsWith('week-')) return 'WEEKLY ROUNDUP';
  if (periodKey.startsWith('month-')) return 'MONTHLY ROUNDUP';
  if (periodKey.startsWith('year-')) return 'YEAR IN REVIEW';
  return 'ROUNDUP';
}

function roundupDateRange(r: ShowcaseRoundup): string | null {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  if (r.periodStart && r.periodEnd) return `${fmt(r.periodStart)} – ${fmt(r.periodEnd)}`;
  if (r.periodStart) return fmt(r.periodStart);
  return null;
}

function getLinkIcon(url: string | undefined): string {
  if (!url) return '↗';
  if (url.includes('strava.com')) return '🚴';
  if (url.includes('instagram.com')) return '📷';
  if (url.includes('github.com')) return '🐙';
  if (url.includes('twitter.com') || url.includes('x.com')) return '🐦';
  if (url.includes('youtube.com')) return '📺';
  return '↗';
}

function LoadingScreen() {
  return (
    <div className="showcase-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <span style={{ fontFamily: 'var(--fg-font-mono)', fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
          Loading profile…
        </span>
      </div>
    </div>
  );
}


export default function ShowcaseProfilePage() {
  const { slug: rawSlug } = useParams<{ slug: string }>();
  const slug = rawSlug?.startsWith('@') ? rawSlug.slice(1) : rawSlug;
  const [profile, setProfile] = useState<ShowcaseProfile | null>(null);
  const [entries, setEntries] = useState<ShowcaseProfileEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [roundups, setRoundups] = useState<ShowcaseRoundup[]>([]);
  const [roundupPage, setRoundupPage] = useState(1);
  const [roundupTotalPages, setRoundupTotalPages] = useState(1);
  const [loadingMoreRoundups, setLoadingMoreRoundups] = useState(false);
  const [roundupError, setRoundupError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [error, setError] = useState(false);
  const { isOwner, resolved: ownershipResolved } = useShowcaseOwner(slug);
  const [viewStats, setViewStats] = useState<clientComponents['schemas']['ShowcaseViewStats'] | null>(null);

  useEffect(() => {
    if (!slug) { setError(true); setLoading(false); return; }
    publicClient
      .GET('/showcase/profile/{slug}', { params: { path: { slug }, query: { page: 1 } } })
      .then(({ data }) => {
        if (!data?.profile) { setError(true); return; }
        setProfile(data.profile);
        setEntries(data.profile.entries ?? []);
        setCurrentPage(data.currentPage ?? 1);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Roundups page 1 loads with the rest of the profile; subsequent pages are
  // appended via infinite scroll (see loadMoreRoundups), mirroring the activity
  // feed's pagination below.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    publicClient
      .GET('/showcase/{slug}/roundups/recent', { params: { path: { slug }, query: { page: 1 } } })
      .then(({ data }) => {
        if (cancelled) return;
        setRoundups(data?.roundups ?? []);
        setRoundupPage(data?.currentPage ?? 1);
        setRoundupTotalPages(data?.totalPages ?? 1);
      })
      .catch(() => {/* roundups optional — fail silently */});
    return () => { cancelled = true; };
  }, [slug]);

  // Record a profile view once both the profile and ownership have resolved —
  // but never for the owner's own visits.
  useEffect(() => {
    if (loading || error || !profile || !slug || !ownershipResolved || isOwner) return;
    recordShowcaseView({ kind: 'profile', slug });
  }, [loading, error, profile, slug, ownershipResolved, isOwner]);

  // Owner-only: fetch de-duplicated view metrics for the inline badge.
  useEffect(() => {
    if (!isOwner) { setViewStats(null); return; }
    let cancelled = false;
    client
      .GET('/users/me/showcase-management/profile/views')
      .then(({ data }) => { if (!cancelled && data) setViewStats(data); })
      .catch(() => { /* not the owner — leave badge hidden */ });
    return () => { cancelled = true; };
  }, [isOwner]);

  const profileMeta = useMemo(() => profile ? ({
    type: 'profile' as const,
    displayName: profile.displayName ?? 'Athlete',
    avatarUrl: profile.profilePictureUrl ?? undefined,
    bio: profile.bio ?? undefined,
    url: window.location.href,
  }) : null, [profile]);

  useShowcaseMeta(profileMeta);

  const loadMoreRoundups = useCallback(async () => {
    if (!slug || loadingMoreRoundups || roundupPage >= roundupTotalPages) return;
    setLoadingMoreRoundups(true);
    setRoundupError(false);
    try {
      const nextPage = roundupPage + 1;
      const { data } = await publicClient.GET('/showcase/{slug}/roundups/recent', {
        params: { path: { slug }, query: { page: nextPage } },
      });
      if (data?.roundups) {
        setRoundups((prev) => [...prev, ...data.roundups!]);
        setRoundupPage(data.currentPage ?? nextPage);
        setRoundupTotalPages(data.totalPages ?? roundupTotalPages);
      }
    } catch {
      // Surface a retry affordance; the observer stops until the user retries.
      setRoundupError(true);
    } finally {
      setLoadingMoreRoundups(false);
    }
  }, [slug, roundupPage, roundupTotalPages, loadingMoreRoundups]);

  const loadMore = useCallback(async () => {
    if (!slug || loadingMore || currentPage >= totalPages) return;
    setLoadingMore(true);
    setFeedError(false);
    try {
      const nextPage = currentPage + 1;
      const { data } = await publicClient.GET('/showcase/profile/{slug}', {
        params: { path: { slug }, query: { page: nextPage } },
      });
      if (data?.profile?.entries) {
        setEntries((prev) => [...prev, ...(data.profile!.entries ?? [])]);
        setCurrentPage(data.currentPage ?? nextPage);
        setTotalPages(data.totalPages ?? totalPages);
      }
    } catch {
      // Surface a retry affordance; the observer stops until the user retries.
      setFeedError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [slug, currentPage, totalPages, loadingMore]);

  const hasMore = currentPage < totalPages;
  const hasMoreRoundups = roundupPage < roundupTotalPages;

  // Auto-load each section as its sentinel scrolls into view. While an error is
  // showing we pass hasMore=false so the observer disconnects instead of
  // hammering a failing endpoint — the visible Retry button re-drives it.
  const feedSentinelRef = useInfiniteScroll<HTMLDivElement>({
    hasMore: hasMore && !feedError,
    loading: loadingMore,
    onLoadMore: loadMore,
  });
  const roundupSentinelRef = useInfiniteScroll<HTMLDivElement>({
    hasMore: hasMoreRoundups && !roundupError,
    loading: loadingMoreRoundups,
    onLoadMore: loadMoreRoundups,
  });

  if (loading) return <LoadingScreen />;
  if (error || !profile) return <ShowcaseNotFound type="profile" />;

  const links = (profile.links ?? []).filter((l: ShowcaseLink) => l.url);
  const callouts = (profile.callouts ?? []).filter((c) => c.text);

  return (
    <div className="showcase-page">
      <div className="showcase-page-bg" aria-hidden="true" />
      <div className="showcase-page-wrap">

        {/* Sticky public nav bar — hidden when rendered inside the native app */}
        {!isNativeApp && (
          <nav className="showcase-pubbar">
            <a className="showcase-pubbar__brand" href="/">
              <span className="showcase-pubbar__brand-icon" aria-hidden="true">FG</span>
              <span className="showcase-pubbar__brand-wordmark" aria-hidden="true">FITGLUE</span>
            </a>
            <div className="showcase-pubbar__actions">
              {isOwner && <ViewCountBadge stats={viewStats} />}
              <a href="/" style={{ fontFamily: 'var(--fg-font-mono)', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-cyan)', textDecoration: 'none' }}>
                TRY FITGLUE →
              </a>
            </div>
          </nav>
        )}

        {/* Full-bleed profile hero */}
        <ProfileHero profile={profile} />

        {/* Medal wall (110px top padding clears the floating avatar) */}
        <MedalWall profile={profile} />

        {/* Lifetime 4-up */}
        <LifetimeStats profile={profile} />

        {/* 52-week consistency heatmap */}
        <ConsistencyHeatmap streakHistory={profile.streakHistory} />

        {/* Lifetime HR zone distribution */}
        <ZoneBar zoneSplit={profile.zoneSplit} />

        {/* Recent roundups */}
        {roundups.length > 0 && (
          <div className="roundup-profile-band">
            <div className="roundup-profile-band__header">
              <div className="roundup-profile-band__label">📅 ROUNDUPS</div>
            </div>
            <div className="roundup-profile-mosaic">
              {roundups.map((r, i) => {
                const totalWeightKg = r.activityTypeBreakdowns?.reduce((s, bd) => s + (bd.totalWeightKg ?? 0), 0) ?? 0;
                const hasStrength = r.activityTypeBreakdowns?.some(bd => (bd.totalSets ?? 0) > 0) ?? false;
                const hasDistance = (r.totalDistanceMeters ?? 0) > 500;
                const prCount = r.prsAchieved?.length ?? 0;
                const dateRange = roundupDateRange(r);

                let secondaryStat = '';
                if (hasDistance && (r.totalDistanceMeters ?? 0) > 0) {
                  const km = r.totalDistanceMeters! / 1000;
                  secondaryStat = `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} km`;
                } else if (hasStrength && totalWeightKg > 0) {
                  const t = totalWeightKg / 1000;
                  secondaryStat = t >= 1 ? `${t.toFixed(1)}t moved` : `${Math.round(totalWeightKg)}kg moved`;
                } else if ((r.totalDurationSeconds ?? 0) > 0) {
                  const h = Math.floor(r.totalDurationSeconds! / 3600);
                  const m = Math.floor((r.totalDurationSeconds! % 3600) / 60);
                  secondaryStat = h > 0 ? `${h}h ${m}m` : `${m}m`;
                }

                return (
                  <Link
                    key={r.roundupId}
                    to={`/@${slug}/${r.periodKey}`}
                    className={`roundup-profile-tile ${roundupTypeClass(r.periodKey ?? '')}${i === 0 ? ' roundup-profile-tile--latest' : ''}`}
                  >
                    <div className="roundup-profile-tile__type">{roundupTypeLabel(r.periodKey ?? '')}</div>
                    <div className="roundup-profile-tile__period">{roundupPeriodLabel(r.periodKey ?? '')}</div>
                    {dateRange && <div className="roundup-profile-tile__dates">{dateRange}</div>}
                    <div className="roundup-profile-tile__hero">
                      {r.totalActivities}
                      <span>{r.totalActivities === 1 ? 'session' : 'sessions'}</span>
                    </div>
                    {secondaryStat && (
                      <div className="roundup-profile-tile__stat">{secondaryStat}</div>
                    )}
                    {prCount > 0 && (
                      <div className="roundup-profile-tile__pr">+{prCount} PRS</div>
                    )}
                  </Link>
                );
              })}
              {/* Auto-load sentinel — clipped by the strip's overflow until the
                  user scrolls to its right edge, so pages load on demand. */}
              {hasMoreRoundups && !roundupError && (
                <div ref={roundupSentinelRef} className="infinite-sentinel" aria-hidden="true" />
              )}
            </div>
            {(hasMoreRoundups || loadingMoreRoundups) && (
              <div className="roundup-profile-band__more">
                {loadingMoreRoundups ? (
                  <span className="infinite-status" role="status" aria-live="polite">
                    <span className="infinite-spinner" aria-hidden="true" />
                    Loading more roundups…
                  </span>
                ) : roundupError ? (
                  <span className="infinite-status infinite-status--error" role="alert">
                    Couldn’t load more roundups.{' '}
                    <button type="button" className="infinite-retry" onClick={loadMoreRoundups}>
                      Retry
                    </button>
                  </span>
                ) : (
                  // Fallback for no-JS / keyboard / browsers without
                  // IntersectionObserver — the observer normally loads first.
                  <button
                    onClick={loadMoreRoundups}
                    className="infinite-more-btn"
                    style={{
                      fontFamily: 'var(--fg-font-mono)',
                      fontSize: '0.75rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--fg-paper)',
                      background: 'none',
                      border: '1px solid var(--color-border, rgba(255,255,255,0.15))',
                      borderRadius: 6,
                      padding: '8px 18px',
                      cursor: 'pointer',
                    }}
                  >
                    Load more roundups →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Activity photo gallery — aggregated from all entries with photos */}
        {profile.showPhotoGallery && (() => {
          const allPhotos = entries
            .flatMap((e) =>
              (e.photoUrls ?? []).map((url) => ({
                url,
                activityTitle: e.title,
                activityHref: e.showcaseId ? `/@${slug}/${e.showcaseId}` : undefined,
              })),
            )
            .slice(0, 30);
          return allPhotos.length > 0 ? <PhotoGallery photos={allPhotos} title="📷 Activity Photos" layout="strip" /> : null;
        })()}

        {/* 4px gradient strip */}
        <div className="profile-strip" />

        {/* Main: activity feed + bio sidebar */}
        <div className="profile-main">
          <div className="profile-feed">
            {/* Route thumbnail strip — only shown if ≥3 activities have map thumbnails */}
            <RouteMosaic entries={entries} profileSlug={slug!} />

            <ActivityGrid
              entries={entries}
              totalActivities={profile.totalActivities}
              profileSlug={slug!}
            />

            {/* Auto-load sentinel — sits just below the grid so the next page
                fetches as the user nears the bottom of the feed. */}
            {hasMore && !feedError && (
              <div ref={feedSentinelRef} className="infinite-sentinel" aria-hidden="true" />
            )}

            {/* Pagination status */}
            {(hasMore || currentPage > 1) && (
              <div className="profile-pagi">
                <span className="profile-pagi__info" style={{ fontFamily: 'var(--fg-font-mono)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                {loadingMore ? (
                  <span className="infinite-status" role="status" aria-live="polite">
                    <span className="infinite-spinner" aria-hidden="true" />
                    Loading more…
                  </span>
                ) : feedError ? (
                  <span className="infinite-status infinite-status--error" role="alert">
                    Couldn’t load more.{' '}
                    <button type="button" className="infinite-retry" onClick={loadMore}>
                      Retry
                    </button>
                  </span>
                ) : hasMore ? (
                  // Fallback for no-JS / keyboard / browsers without
                  // IntersectionObserver — the observer normally loads first.
                  <button
                    onClick={loadMore}
                    className="infinite-more-btn"
                    style={{
                      fontFamily: 'var(--fg-font-mono)',
                      fontSize: '0.75rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--fg-paper)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    NEXT →
                  </button>
                ) : (
                  <span className="profile-pagi__info" style={{ fontFamily: 'var(--fg-font-mono)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                    That’s all ✨
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Sticky bio sidebar */}
          <aside className="profile-bio">
            {profile.bio && (
              <p className="bio__about">{profile.bio}</p>
            )}

            {callouts.length > 0 && (
              <div className="bio__callouts">
                {callouts.map((c, i) => (
                  <div key={i} className="bio__callout">
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
            )}

            {links.length > 0 && (
              <div className="bio__section">
                <div className="bio__section-label">LINKS</div>
                {links.map((link: ShowcaseLink, i: number) => (
                  <a
                    key={i}
                    href={link.url?.startsWith('https://') || link.url?.startsWith('http://') ? link.url : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bio__link"
                  >
                    <span>{getLinkIcon(link.url)}</span>
                    <span>{link.label ?? link.url}</span>
                  </a>
                ))}
              </div>
            )}

            <a href="/" className="bio__cta">✦ START YOUR SHOWCASE</a>
          </aside>
        </div>

      </div>
    </div>
  );
}
