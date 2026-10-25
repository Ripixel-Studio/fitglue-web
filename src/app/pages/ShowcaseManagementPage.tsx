import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { logger } from '../../shared/logger';
import { Stack, SettingsLayout, SubNavTabs } from '../components/library/layout';
import { Button, Paragraph, Card, Heading, Link, CardSkeleton, Avatar, Pagination } from '../components/library/ui';
import { FormField, Input, Textarea, Toggle } from '../components/library/forms';
import { client } from '../../shared/api/client';
import { useToast } from '../components/library/ui/Toast/Toast';
import { ImageCropModal } from '../components/ImageCropModal';
import { formatActivityType, formatActivitySource } from '../../types/pb/enum-formatters';
import type { components } from '../../shared/api/schema-client';
import './ShowcaseManagementPage.css';

type ShowcaseViewStats = components['schemas']['ShowcaseViewStats'];
type ShowcaseViewStatsList = components['schemas']['ListShowcaseViewStatsGatewayResponse'];

function viewCount(v: string | undefined): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
}

type ShowcaseSection = 'profile' | 'activities' | 'views' | 'theme' | 'links' | 'roundup' | 'danger';

interface ShowcaseActivity {
    showcaseId: string;
    title: string;
    activityType: string;
    source: string;
    startTime: string;
    createdAt: string;
    inProfile: boolean;
}

interface ShowcaseTheme {
    themeId: string;
    customAccentColor: string;
    animationId: string;
    cardStyle: string;
}

interface ShowcaseLink {
    label: string;
    url: string;
}

interface ShowcaseBioCallout {
    text: string;
}

interface ShowcaseProfile {
    slug: string;
    displayName: string;
    subtitle: string;
    bio: string;
    profilePictureUrl: string;
    visible: boolean;
    showPhotoGallery?: boolean;
    entries: Array<{ showcaseId: string }>;
    theme?: ShowcaseTheme;
    links?: ShowcaseLink[];
    callouts?: ShowcaseBioCallout[];
}

const THEME_PRESETS = [
    { id: 'default', name: 'FitGlue Classic', accent: '#ff3da6', gradient: 'linear-gradient(135deg, #0a0a0a, #1a0a20, #0a0a0a)' },
    { id: 'midnight', name: 'Midnight Blue', accent: '#22d3ee', gradient: 'linear-gradient(135deg, #0a0a1a, #0d1b3e, #0a0a1a)' },
    { id: 'ember', name: 'Ember', accent: '#FF6B35', gradient: 'linear-gradient(135deg, #0a0a0a, #2a0a0a, #0a0a0a)' },
    { id: 'forest', name: 'Forest', accent: '#4ADE80', gradient: 'linear-gradient(135deg, #0a0a0a, #0a1a0d, #0a0a0a)' },
    { id: 'neon', name: 'Neon Night', accent: '#E040FB', gradient: 'linear-gradient(135deg, #0a0a0a, #1a0a2a, #0a0a0a)' },
    { id: 'arctic', name: 'Arctic', accent: '#7DD3FC', gradient: 'linear-gradient(135deg, #0a0a0a, #0a1a2a, #0a0a0a)' },
    { id: 'golden', name: 'Golden Hour', accent: '#FBBF24', gradient: 'linear-gradient(135deg, #0a0a0a, #1a1a0a, #0a0a0a)' },
    { id: 'stealth', name: 'Stealth', accent: '#9CA3AF', gradient: 'linear-gradient(135deg, #050505, #111111, #050505)' },
];

const ANIMATION_OPTIONS = [
    { id: 'particles', name: 'Constellation', icon: '✨' },
    { id: 'pulse', name: 'Pulse Waves', icon: '🔵' },
    { id: 'aurora', name: 'Aurora', icon: '🌌' },
    { id: 'rain', name: 'Digital Rain', icon: '🌧️' },
    { id: 'none', name: 'None', icon: '⬛' },
];

const CARD_STYLE_OPTIONS = [
    { id: 'glass', name: 'Glass', desc: 'Frosted glass with backdrop blur' },
    { id: 'solid', name: 'Solid', desc: 'Opaque dark with subtle border' },
    { id: 'outline', name: 'Outline', desc: 'Transparent with accent border' },
    { id: 'minimal', name: 'Minimal', desc: 'No border, subtle tint' },
];



const NAV_ITEMS: { id: ShowcaseSection; icon: string; label: string }[] = [
    { id: 'profile', icon: '👤', label: 'PROFILE' },
    { id: 'activities', icon: '🏃', label: 'ACTIVITIES' },
    { id: 'views', icon: '👁', label: 'VIEWS' },
    { id: 'theme', icon: '🎨', label: 'THEME' },
    { id: 'links', icon: '🔗', label: 'LINKS' },
    { id: 'roundup', icon: '📅', label: 'ROUNDUP' },
    { id: 'danger', icon: '⊗', label: 'DANGER ZONE' },
];

const ShowcaseManagementPage: React.FC = () => {
    const { success: showSuccess, error: showError } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeSection = (searchParams.get('section') as ShowcaseSection) || 'profile';

    const setSection = (section: ShowcaseSection) => {
        searchParams.set('section', section);
        setSearchParams(searchParams, { replace: true });
    };

    // Profile state
    const [profile, setProfile] = useState<ShowcaseProfile | null>(null);
    const [activities, setActivities] = useState<ShowcaseActivity[]>([]);
    const [loading, setLoading] = useState(true);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Editable fields
    const [subtitle, setSubtitle] = useState('');
    const [bio, setBio] = useState('');
    const [slug, setSlug] = useState('');
    const [slugError, setSlugError] = useState('');
    const [saving, setSaving] = useState(false);
    const [savingSlug, setSavingSlug] = useState(false);

    // Picture upload status
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');

    // Default destination
    const [defaultDestination, setDefaultDestination] = useState(false);
    const [profileVisible, setProfileVisible] = useState(true);
    const [showPhotoGallery, setShowPhotoGallery] = useState(false);
    const [loadingPrefs, setLoadingPrefs] = useState(true);

    // Theme state
    const [themeId, setThemeId] = useState('default');
    const [customAccentColor, setCustomAccentColor] = useState('');
    const [animationId, setAnimationId] = useState('particles');
    const [cardStyle, setCardStyle] = useState('glass');
    const [savingTheme, setSavingTheme] = useState(false);

    // Links state
    const [links, setLinks] = useState<ShowcaseLink[]>([]);
    const [newLinkLabel, setNewLinkLabel] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [linkError, setLinkError] = useState('');
    const [savingLinks, setSavingLinks] = useState(false);

    // Callouts state
    const [callouts, setCallouts] = useState<ShowcaseBioCallout[]>([]);
    const [newCalloutText, setNewCalloutText] = useState('');
    const [calloutError, setCalloutError] = useState('');
    const [savingCallouts, setSavingCallouts] = useState(false);

    // Roundup settings (Athlete-tier)
    const [roundupWeekly, setRoundupWeekly] = useState(false);
    const [roundupMonthly, setRoundupMonthly] = useState(false);
    const [roundupYearly, setRoundupYearly] = useState(false);
    const [savingRoundup, setSavingRoundup] = useState(false);

    // View metrics (aggregate + per-showcase)
    const [viewStats, setViewStats] = useState<ShowcaseViewStatsList | null>(null);
    const [loadingViews, setLoadingViews] = useState(false);


    // Fetch profile data
    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await client.GET('/users/me/showcase-management/profile');
            const typedData = data as { profile: ShowcaseProfile | null; activities: ShowcaseActivity[] };
            setProfile(typedData?.profile ?? null);
            setActivities((typedData?.activities || []).sort((a, b) =>
                new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
            ));
            if (typedData?.profile) {
                setSubtitle(typedData.profile.subtitle || '');
                setBio(typedData.profile.bio || '');
                setSlug(typedData.profile.slug || '');
                setProfileVisible(typedData.profile.visible !== false);
                if (typedData.profile.theme) {
                    setThemeId(typedData.profile.theme.themeId || 'default');
                    setCustomAccentColor(typedData.profile.theme.customAccentColor || '');
                    setAnimationId(typedData.profile.theme.animationId || 'particles');
                    setCardStyle(typedData.profile.theme.cardStyle || 'glass');
                }
                setLinks(typedData.profile.links || []);
                setCallouts(typedData.profile.callouts || []);
                setShowPhotoGallery(typedData.profile.showPhotoGallery ?? false);
                const rs = (typedData.profile as unknown as { roundupSettings?: { enabledWeekly?: boolean; enabledMonthly?: boolean; enabledYearly?: boolean } }).roundupSettings;
                setRoundupWeekly(rs?.enabledWeekly ?? false);
                setRoundupMonthly(rs?.enabledMonthly ?? false);
                setRoundupYearly(rs?.enabledYearly ?? false);
            }
        } catch (err) {
            logger.warn('Failed to load showcase profile:', err);
            showError('Failed to load profile');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    // Fetch preferences
    const fetchPreferences = useCallback(async () => {
        try {
            const { data } = await client.GET('/users/me/showcase-management/preferences');
            const typedData = data as { defaultDestination: boolean };
            setDefaultDestination(typedData?.defaultDestination ?? false);
        } catch (err) {
            logger.warn('Failed to load preferences:', err);
        } finally {
            setLoadingPrefs(false);
        }
    }, []);

    useEffect(() => {
        fetchProfile();
        fetchPreferences();
    }, [fetchProfile, fetchPreferences]);

    // Save profile fields

    // Lazy-load view metrics when the Views tab is opened.
    useEffect(() => {
        if (activeSection !== 'views') return;
        let cancelled = false;
        setLoadingViews(true);
        client
            .GET('/users/me/showcase-management/views')
            .then(({ data }) => { if (!cancelled && data) setViewStats(data as ShowcaseViewStatsList); })
            .catch((err) => { logger.warn('Failed to load showcase view metrics:', err); })
            .finally(() => { if (!cancelled) setLoadingViews(false); });
        return () => { cancelled = true; };
    }, [activeSection]);

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            await client.PUT('/users/me/showcase-management/profile', { body: { subtitle, bio } as never });
            showSuccess('Profile updated');
        } catch (err) {
            logger.error('Failed to save profile:', err);
            showError('Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    // Save slug
    const handleSaveSlug = async () => {
        if (!slug.trim()) return;
        setSavingSlug(true);
        setSlugError('');
        try {
            const { data: result } = await client.PUT('/users/me/showcase-management/profile/slug', { body: { slug } as never });
            const typedResult = result as { slug: string };
            setSlug(typedResult?.slug || slug);
            showSuccess('Slug updated');
            // Refresh profile to get updated data
            fetchProfile();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to update slug';
            if (errorMsg.includes('409')) {
                setSlugError('That slug is already taken — try a different one');
            } else {
                setSlugError(errorMsg);
            }
        } finally {
            setSavingSlug(false);
        }
    };

    // Save theme
    const handleSaveTheme = async () => {
        setSavingTheme(true);
        try {
            await client.PUT('/users/me/showcase-management/profile', {
                body: { theme: { themeId, customAccentColor, animationId, cardStyle } } as never,
            });
            showSuccess('Theme updated');
        } catch (err) {
            logger.error('Failed to save theme:', err);
            showError('Failed to save theme');
        } finally {
            setSavingTheme(false);
        }
    };

    // Save links
    const handleAddLink = async () => {
        setLinkError('');
        const label = newLinkLabel.trim();
        const url = newLinkUrl.trim();
        if (!label) { setLinkError('Label is required'); return; }
        if (!url) { setLinkError('URL is required'); return; }
        if (!url.startsWith('https://')) { setLinkError('URL must start with https://'); return; }
        if (url.length > 200) { setLinkError('URL must be 200 characters or fewer'); return; }
        if (label.length > 50) { setLinkError('Label must be 50 characters or fewer'); return; }
        if (links.length >= 10) { setLinkError('Maximum 10 links allowed'); return; }

        const updatedLinks = [...links, { label, url }];
        setSavingLinks(true);
        try {
            await client.PUT('/users/me/showcase-management/profile', { body: { links: updatedLinks } as never });
            setLinks(updatedLinks);
            setNewLinkLabel('');
            setNewLinkUrl('');
            showSuccess('Link added');
        } catch (err) {
            logger.error('Failed to save links:', err);
            showError('Failed to save link');
        } finally {
            setSavingLinks(false);
        }
    };

    const handleRemoveLink = async (index: number) => {
        const updatedLinks = links.filter((_, i) => i !== index);
        setSavingLinks(true);
        try {
            await client.PUT('/users/me/showcase-management/profile', { body: { links: updatedLinks } as never });
            setLinks(updatedLinks);
            showSuccess('Link removed');
        } catch (err) {
            logger.error('Failed to remove link:', err);
            showError('Failed to remove link');
        } finally {
            setSavingLinks(false);
        }
    };

    // Callout handlers
    const handleAddCallout = async () => {
        setCalloutError('');
        const text = newCalloutText.trim();
        if (!text) { setCalloutError('Callout text is required'); return; }
        if (text.length > 150) { setCalloutError('Callout must be 150 characters or fewer'); return; }
        if (callouts.length >= 10) { setCalloutError('Maximum 10 callouts allowed'); return; }

        const updated = [...callouts, { text }];
        setSavingCallouts(true);
        try {
            await client.PUT('/users/me/showcase-management/profile', { body: { callouts: updated } as never });
            setCallouts(updated);
            setNewCalloutText('');
            showSuccess('Callout added');
        } catch (err) {
            logger.error('Failed to save callout:', err);
            showError('Failed to save callout');
        } finally {
            setSavingCallouts(false);
        }
    };

    const handleRemoveCallout = async (index: number) => {
        const updated = callouts.filter((_, i) => i !== index);
        setSavingCallouts(true);
        try {
            await client.PUT('/users/me/showcase-management/profile', { body: { callouts: updated } as never });
            setCallouts(updated);
            showSuccess('Callout removed');
        } catch (err) {
            logger.error('Failed to remove callout:', err);
            showError('Failed to remove callout');
        } finally {
            setSavingCallouts(false);
        }
    };

    // Toggle default destination
    const handleToggleDefaultDestination = async () => {
        const newVal = !defaultDestination;
        setDefaultDestination(newVal);
        try {
            await client.PUT('/users/me/showcase-management/preferences', {
                body: { defaultDestination: newVal } as never,
            });
            showSuccess(newVal ? 'Showcase will be added to new pipelines' : 'Default destination disabled');
        } catch (err) {
            // Revert on failure
            setDefaultDestination(!newVal);
            logger.error('Failed to update preference:', err);
            showError('Failed to update preference');
        }
    };

    // Toggle profile visibility
    const handleToggleVisibility = async () => {
        const newVal = !profileVisible;
        setProfileVisible(newVal);
        try {
            await client.PUT('/users/me/showcase-management/profile', { body: { visible: newVal } as never });
            showSuccess(newVal ? 'Profile is now publicly visible' : 'Profile is now hidden');
        } catch (err) {
            setProfileVisible(!newVal);
            logger.error('Failed to update visibility:', err);
            showError('Failed to update visibility');
        }
    };

    // Toggle photo gallery
    const handleTogglePhotoGallery = async () => {
        const newVal = !showPhotoGallery;
        setShowPhotoGallery(newVal);
        try {
            await client.PUT('/users/me/showcase-management/profile', {
                body: { showPhotoGallery: newVal } as never,
            });
            showSuccess(newVal ? 'Photo gallery enabled' : 'Photo gallery disabled');
        } catch (err) {
            setShowPhotoGallery(!newVal);
            logger.error('Failed to update photo gallery setting:', err);
            showError('Failed to update photo gallery setting');
        }
    };

    const handleSaveRoundupSettings = async (weekly: boolean, monthly: boolean, yearly: boolean) => {
        setSavingRoundup(true);
        try {
            await client.PUT('/users/me/showcase-management/roundup-settings', {
                body: { settings: { enabledWeekly: weekly, enabledMonthly: monthly, enabledYearly: yearly } } as never,
            });
            setRoundupWeekly(weekly);
            setRoundupMonthly(monthly);
            setRoundupYearly(yearly);
            showSuccess('Roundup settings saved');
        } catch (err) {
            logger.error('Failed to save roundup settings:', err);
            showError('Failed to save roundup settings');
        } finally {
            setSavingRoundup(false);
        }
    };

    // Remove activity from profile (optimistic)
    const handleRemoveEntry = async (showcaseId: string) => {
        // Optimistic update
        setActivities(prev => prev.map(a =>
            a.showcaseId === showcaseId ? { ...a, inProfile: false } : a
        ));
        try {
            await client.DELETE('/users/me/showcase-management/profile/entries/{showcaseId}', { params: { path: { showcaseId } } });
            showSuccess('Entry removed');
        } catch (err) {
            // Revert on failure
            setActivities(prev => prev.map(a =>
                a.showcaseId === showcaseId ? { ...a, inProfile: true } : a
            ));
            logger.error('Failed to remove entry:', err);
            showError('Failed to remove entry');
        }
    };

    // Add activity to profile (optimistic)
    const handleAddEntry = async (showcaseId: string) => {
        // Optimistic update
        setActivities(prev => prev.map(a =>
            a.showcaseId === showcaseId ? { ...a, inProfile: true } : a
        ));
        try {
            await client.POST('/users/me/showcase-management/profile/entries/{showcaseId}', { params: { path: { showcaseId } } });
            showSuccess('Entry added');
        } catch (err) {
            // Revert on failure
            setActivities(prev => prev.map(a =>
                a.showcaseId === showcaseId ? { ...a, inProfile: false } : a
            ));
            logger.error('Failed to add entry:', err);
            showError('Failed to add entry');
        }
    };

    // Pagination derived values
    const totalPages = useMemo(() => Math.max(1, Math.ceil(activities.length / pageSize)), [activities.length, pageSize]);
    const paginatedActivities = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return activities.slice(start, start + pageSize);
    }, [activities, currentPage, pageSize]);

    // Reset to page 1 if current page is out of bounds
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [currentPage, totalPages]);

    // Picture crop state
    const [cropImage, setCropImage] = useState<string | null>(null);

    // Picture upload — pick file first, then show crop modal
    const handlePictureUpload = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const objectUrl = URL.createObjectURL(file);
            setCropImage(objectUrl);
        };
        input.click();
    };

    // After cropping, upload the cropped blob
    const handleCropComplete = async (croppedBlob: Blob) => {
        // Close the crop modal
        if (cropImage) URL.revokeObjectURL(cropImage);
        setCropImage(null);

        setUploading(true);
        setUploadStatus('Preparing upload…');

        try {
            // Cropped output is always WebP from canvas
            const { data } = await client.POST('/users/me/showcase-management/profile/picture', {
                body: { contentType: 'image/webp' } as never,
            });
            const typedData = data as unknown as {
                uploadUrl: string;
                publicUrl: string;
                contentType: string;
                maxSizeBytes: number;
            };

            setUploadStatus('Uploading photo…');

            // Upload to GCS via signed URL
            // x-goog-content-length-range must match the extensionHeaders used during signing
            const uploadResponse = await fetch(typedData.uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': typedData.contentType,
                    'x-goog-content-length-range': `0,${typedData.maxSizeBytes}`,
                },
                body: croppedBlob,
            });
            if (!uploadResponse.ok) {
                throw new Error(`GCS upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
            }

            setUploadStatus('Saving…');

            // Update profile with the new URL
            await client.PUT('/users/me/showcase-management/profile', {
                body: { profilePictureUrl: typedData.publicUrl } as never,
            });

            showSuccess('Profile picture updated');
            fetchProfile();
        } catch (err) {
            logger.error('Failed to upload picture:', err);
            const msg = err instanceof Error && err.message.startsWith('GCS upload')
                ? 'Failed to upload photo — please try again'
                : 'Failed to update profile picture';
            showError(msg);
        } finally {
            setUploading(false);
            setUploadStatus('');
        }
    };

    const handleCropCancel = () => {
        if (cropImage) URL.revokeObjectURL(cropImage);
        setCropImage(null);
    };

    if (loading) {
        return (
            <SettingsLayout title="Showcase">
                <div style={{ padding: '2rem' }}>
                    <CardSkeleton variant="integration" />
                    <CardSkeleton variant="integration" />
                    <CardSkeleton variant="integration" />
                </div>
            </SettingsLayout>
        );
    }

    if (!profile) {
        return (
            <SettingsLayout title="Showcase">
                <Stack className="showcase-mgmt__empty" align="center" gap="md" style={{ padding: '3rem 2rem' }}>
                    <Paragraph className="showcase-mgmt__empty-icon">🌟</Paragraph>
                    <Paragraph>No showcase profile found.</Paragraph>
                    <Paragraph size="sm">
                        Showcase activities from your pipeline runs to create your public profile.
                    </Paragraph>
                </Stack>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout>
            <div className="fg-band">
                <span className="fg-band__label">SHOWCASE · PUBLIC PROFILE</span>
            </div>

            <SubNavTabs
                tabs={NAV_ITEMS.map(item => ({ key: item.id, label: item.label }))}
                active={activeSection}
                onSelect={(key) => setSection(key as ShowcaseSection)}
                aria-label="Showcase sections"
            />

            <div className="sm-panel">

                    {/* ── PROFILE ── */}
                    {activeSection === 'profile' && (
                        <>
                            <Card className="showcase-mgmt__section">
                                <Stack gap="md">
                                    <Heading level={3} className="showcase-mgmt__section-title">
                                        👤 Profile
                                    </Heading>
                                    <Stack direction="horizontal" className="showcase-mgmt__avatar-section" gap="md" align="center">
                                        <Avatar
                                            initial={profile.displayName?.charAt(0) || '?'}
                                            src={profile.profilePictureUrl || undefined}
                                            size="lg"
                                        />
                                        <Stack className="showcase-mgmt__avatar-actions" gap="xs">
                                            <Button variant="secondary" size="small" onClick={handlePictureUpload} disabled={uploading}>
                                                {uploading ? '⏳ Uploading…' : 'Upload Photo'}
                                            </Button>
                                            <Paragraph size="sm" muted className="showcase-mgmt__avatar-hint">
                                                {uploadStatus || 'WebP recommended • Max 5MB'}
                                            </Paragraph>
                                        </Stack>
                                    </Stack>

                                    <FormField label="Subtitle">
                                        <Input
                                            value={subtitle}
                                            onChange={(e) => setSubtitle(e.target.value.slice(0, 100))}
                                            placeholder="e.g. Marathon runner & trail enthusiast"
                                            maxLength={100}
                                        />
                                        <Paragraph inline size="sm" muted className="showcase-mgmt__char-count">{subtitle.length}/100</Paragraph>
                                    </FormField>

                                    <FormField label="Bio">
                                        <Textarea
                                            value={bio}
                                            onChange={(e) => setBio(e.target.value.slice(0, 500))}
                                            placeholder="Tell visitors about your fitness journey..."
                                            maxLength={500}
                                        />
                                        <Paragraph inline size="sm" muted className="showcase-mgmt__char-count">{bio.length}/500</Paragraph>
                                    </FormField>

                                    <Stack className="showcase-mgmt__actions">
                                        <Button variant="primary" size="small" onClick={handleSaveProfile} disabled={saving}>
                                            {saving ? 'Saving…' : 'Save Profile'}
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Card>

                            <Card className="showcase-mgmt__section">
                                <Stack gap="sm">
                                    <Heading level={3} className="showcase-mgmt__section-title">
                                        🔗 Public URL
                                    </Heading>
                                    <Stack direction="horizontal" className="showcase-mgmt__slug-row" gap="sm" align="center">
                                        <FormField label="">
                                            <Stack direction="horizontal" gap="xs" align="center">
                                                <Paragraph inline className="showcase-mgmt__slug-prefix">fitglue.tech/@</Paragraph>
                                                <Input
                                                    value={slug}
                                                    onChange={(e) => {
                                                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                                        setSlugError('');
                                                    }}
                                                    placeholder="your-slug"
                                                />
                                            </Stack>
                                        </FormField>
                                        <Button
                                            variant="secondary"
                                            size="small"
                                            onClick={handleSaveSlug}
                                            disabled={savingSlug || slug === profile.slug}
                                        >
                                            {savingSlug ? 'Updating…' : 'Update Slug'}
                                        </Button>
                                    </Stack>
                                    {slugError && <Paragraph className="showcase-mgmt__slug-error">{slugError}</Paragraph>}
                                    {profileVisible ? (
                                        <Link
                                            href={`/@${encodeURIComponent(profile.slug)}`}
                                            external
                                            className="showcase-mgmt__view-link"
                                        >
                                            View public profile →
                                        </Link>
                                    ) : (
                                        <Paragraph inline className="showcase-mgmt__view-link showcase-mgmt__view-link--hidden">
                                            🔒 Profile is hidden — enable visibility to share
                                        </Paragraph>
                                    )}
                                </Stack>
                            </Card>

                            <Card className="showcase-mgmt__section">
                                <Stack gap="md">
                                    <Heading level={3} className="showcase-mgmt__section-title">
                                        ⚡ Preferences
                                    </Heading>
                                    <Toggle
                                        label="Default destination for new pipelines"
                                        description="Automatically add Showcase as a destination when creating new pipelines"
                                        checked={defaultDestination}
                                        onChange={handleToggleDefaultDestination}
                                        disabled={loadingPrefs}
                                    />
                                    <Toggle
                                        label="Show photo gallery on public profile"
                                        description="Display a gallery of activity route images on your public showcase profile page"
                                        checked={showPhotoGallery}
                                        onChange={handleTogglePhotoGallery}
                                    />
                                </Stack>
                            </Card>
                        </>
                    )}

                    {/* ── ACTIVITIES ── */}
                    {activeSection === 'activities' && (
                        <Card className="showcase-mgmt__section">
                            <Stack gap="md">
                                <Heading level={3} className="showcase-mgmt__section-title">
                                    🏆 Showcased Activities ({activities.filter(a => a.inProfile).length})
                                </Heading>

                                {activities.length === 0 ? (
                                    <Stack className="showcase-mgmt__empty" align="center">
                                        <Paragraph size="sm">
                                            No activities have been showcased yet. Set up a pipeline with the Showcase destination to get started.
                                        </Paragraph>
                                    </Stack>
                                ) : (
                                    <>
                                        <Stack className="showcase-mgmt__activity-list" gap="sm">
                                            {paginatedActivities.map(activity => (
                                                <Card key={activity.showcaseId} className="showcase-mgmt__activity-item">
                                                    <Stack direction="horizontal" align="center" justify="between">
                                                        <Stack className="showcase-mgmt__activity-info" gap="xs">
                                                            <Paragraph className="showcase-mgmt__activity-title">
                                                                {activity.title || 'Untitled Activity'}
                                                            </Paragraph>
                                                            <Paragraph size="sm" muted className="showcase-mgmt__activity-meta">
                                                                {formatActivityType(activity.activityType)} • {formatActivitySource(activity.source)}
                                                                {activity.startTime && ` • ${new Date(activity.startTime).toLocaleDateString()}`}
                                                            </Paragraph>
                                                        </Stack>
                                                        <Stack className="showcase-mgmt__activity-actions">
                                                            {activity.inProfile ? (
                                                                <Button
                                                                    variant="danger"
                                                                    size="small"
                                                                    onClick={() => handleRemoveEntry(activity.showcaseId)}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    variant="secondary"
                                                                    size="small"
                                                                    onClick={() => handleAddEntry(activity.showcaseId)}
                                                                >
                                                                    Add to Profile
                                                                </Button>
                                                            )}
                                                        </Stack>
                                                    </Stack>
                                                </Card>
                                            ))}
                                        </Stack>
                                        {totalPages > 1 && (
                                            <Stack className="showcase-mgmt__pagination">
                                                <Pagination
                                                    currentPage={currentPage}
                                                    totalPages={totalPages}
                                                    totalItems={activities.length}
                                                    pageSize={pageSize}
                                                    onPageChange={setCurrentPage}
                                                    onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                                                    showPageSize
                                                    pageSizeOptions={[10, 25, 50]}
                                                    compact
                                                />
                                            </Stack>
                                        )}
                                    </>
                                )}
                            </Stack>
                        </Card>
                    )}

                    {/* ── VIEWS ── */}
                    {activeSection === 'views' && (
                        <Card className="showcase-mgmt__section">
                            <Stack gap="md">
                                <Heading level={3} className="showcase-mgmt__section-title">
                                    👁 Showcase Views
                                </Heading>
                                <Paragraph size="sm" muted>
                                    De-duplicated public view metrics. Your own visits and known bots aren&apos;t counted.
                                </Paragraph>

                                {loadingViews && !viewStats ? (
                                    <CardSkeleton variant="integration" />
                                ) : (() => {
                                    const titleById = new Map(activities.map(a => [a.showcaseId, a.title]));
                                    const perShowcase = [...(viewStats?.showcases ?? [])]
                                        .sort((a, b) => viewCount(b.views) - viewCount(a.views));
                                    const perRoundup = [...(viewStats?.roundups ?? [])]
                                        .sort((a, b) => viewCount(b.views) - viewCount(a.views));
                                    const hasAny = viewCount(viewStats?.totalViews) > 0 || perShowcase.length > 0 || perRoundup.length > 0;

                                    const StatTile = ({ label, value }: { label: string; value: number }) => (
                                        <Card className="showcase-mgmt__view-tile">
                                            <Paragraph className="showcase-mgmt__view-tile-num">{value.toLocaleString()}</Paragraph>
                                            <Paragraph size="sm" muted>{label}</Paragraph>
                                        </Card>
                                    );

                                    if (!hasAny) {
                                        return (
                                            <Stack className="showcase-mgmt__empty" align="center">
                                                <Paragraph size="sm">
                                                    No views recorded yet. Share your showcase link to start tracking.
                                                </Paragraph>
                                            </Stack>
                                        );
                                    }

                                    return (
                                        <>
                                            <Stack direction="horizontal" gap="sm" className="showcase-mgmt__view-tiles">
                                                <StatTile label="Total views" value={viewCount(viewStats?.totalViews)} />
                                                <StatTile label="Unique visitors" value={viewCount(viewStats?.totalVisitors)} />
                                            </Stack>

                                            <Stack className="showcase-mgmt__view-list" gap="sm">
                                                {viewStats?.profile && (
                                                    <Card className="showcase-mgmt__activity-item">
                                                        <Stack direction="horizontal" align="center" justify="between">
                                                            <Paragraph className="showcase-mgmt__activity-title">Profile page</Paragraph>
                                                            <Paragraph size="sm" muted>
                                                                {viewCount(viewStats.profile.views).toLocaleString()} views · {viewCount(viewStats.profile.visitors).toLocaleString()} visitors
                                                            </Paragraph>
                                                        </Stack>
                                                    </Card>
                                                )}
                                                {perShowcase.map((s: ShowcaseViewStats) => {
                                                    const showcaseId = (s.targetKey ?? '').replace(/^activity:/, '');
                                                    return (
                                                        <Card key={s.targetKey} className="showcase-mgmt__activity-item">
                                                            <Stack direction="horizontal" align="center" justify="between">
                                                                <Paragraph className="showcase-mgmt__activity-title">
                                                                    {titleById.get(showcaseId) || 'Untitled Activity'}
                                                                </Paragraph>
                                                                <Paragraph size="sm" muted>
                                                                    {viewCount(s.views).toLocaleString()} views · {viewCount(s.visitors).toLocaleString()} visitors
                                                                </Paragraph>
                                                            </Stack>
                                                        </Card>
                                                    );
                                                })}
                                                {perRoundup.map((s: ShowcaseViewStats) => {
                                                    // target_key: "roundup:{slug}:{periodKey}"
                                                    const periodKey = (s.targetKey ?? '').split(':').slice(2).join(':');
                                                    return (
                                                        <Card key={s.targetKey} className="showcase-mgmt__activity-item">
                                                            <Stack direction="horizontal" align="center" justify="between">
                                                                <Paragraph className="showcase-mgmt__activity-title">
                                                                    📅 Roundup · {periodKey}
                                                                </Paragraph>
                                                                <Paragraph size="sm" muted>
                                                                    {viewCount(s.views).toLocaleString()} views · {viewCount(s.visitors).toLocaleString()} visitors
                                                                </Paragraph>
                                                            </Stack>
                                                        </Card>
                                                    );
                                                })}
                                            </Stack>
                                        </>
                                    );
                                })()}
                            </Stack>
                        </Card>
                    )}

                    {/* ── THEME ── */}
                    {activeSection === 'theme' && (
                        <Card className="showcase-mgmt__section">
                            <Stack gap="md">
                                <Heading level={3} className="showcase-mgmt__section-title">
                                    🎨 Appearance
                                </Heading>

                                <FormField label="Theme">
                                    <Stack className="showcase-mgmt__theme-grid">
                                        {THEME_PRESETS.map(t => (
                                            <button
                                                key={t.id}
                                                className={`showcase-mgmt__theme-swatch ${themeId === t.id ? 'showcase-mgmt__theme-swatch--active' : ''}`}
                                                onClick={() => setThemeId(t.id)}
                                                type="button"
                                            >
                                                <Stack
                                                    className="showcase-mgmt__theme-swatch-preview"
                                                    style={{ background: t.gradient }}
                                                >
                                                    <Stack
                                                        className="showcase-mgmt__theme-swatch-accent"
                                                        style={{ background: t.accent }}
                                                    />
                                                </Stack>
                                                <Paragraph inline className="showcase-mgmt__theme-swatch-name">{t.name}</Paragraph>
                                            </button>
                                        ))}
                                    </Stack>
                                </FormField>

                                <FormField label="Custom accent colour">
                                    <Stack direction="horizontal" gap="sm" align="center">
                                        <input
                                            type="color"
                                            value={customAccentColor || THEME_PRESETS.find(t => t.id === themeId)?.accent || '#ff3da6'}
                                            onChange={(e) => setCustomAccentColor(e.target.value)}
                                            className="showcase-mgmt__color-picker"
                                        />
                                        <Input
                                            value={customAccentColor}
                                            onChange={(e) => setCustomAccentColor(e.target.value)}
                                            placeholder="Leave empty for theme default"
                                            maxLength={7}
                                        />
                                        {customAccentColor && (
                                            <Button variant="text" size="small" onClick={() => setCustomAccentColor('')}>
                                                Reset
                                            </Button>
                                        )}
                                    </Stack>
                                </FormField>

                                <FormField label="Background animation">
                                    <Stack className="showcase-mgmt__option-grid">
                                        {ANIMATION_OPTIONS.map(opt => (
                                            <button
                                                key={opt.id}
                                                className={`showcase-mgmt__option-btn ${animationId === opt.id ? 'showcase-mgmt__option-btn--active' : ''}`}
                                                onClick={() => setAnimationId(opt.id)}
                                                type="button"
                                            >
                                                <Paragraph inline className="showcase-mgmt__option-icon">{opt.icon}</Paragraph>
                                                <Paragraph inline className="showcase-mgmt__option-name">{opt.name}</Paragraph>
                                            </button>
                                        ))}
                                    </Stack>
                                </FormField>

                                <FormField label="Card style">
                                    <Stack className="showcase-mgmt__option-grid">
                                        {CARD_STYLE_OPTIONS.map(opt => (
                                            <button
                                                key={opt.id}
                                                className={`showcase-mgmt__option-btn ${cardStyle === opt.id ? 'showcase-mgmt__option-btn--active' : ''}`}
                                                onClick={() => setCardStyle(opt.id)}
                                                type="button"
                                            >
                                                <Paragraph inline className="showcase-mgmt__option-name">{opt.name}</Paragraph>
                                                <Paragraph size="sm" muted>{opt.desc}</Paragraph>
                                            </button>
                                        ))}
                                    </Stack>
                                </FormField>

                                <Stack className="showcase-mgmt__actions">
                                    <Button variant="primary" size="small" onClick={handleSaveTheme} disabled={savingTheme}>
                                        {savingTheme ? 'Saving…' : 'Save Theme'}
                                    </Button>
                                </Stack>
                            </Stack>
                        </Card>
                    )}

                    {/* ── LINKS ── */}
                    {activeSection === 'links' && (
                        <>
                            <Card className="showcase-mgmt__section">
                                <Stack gap="md">
                                    <Heading level={3} className="showcase-mgmt__section-title">
                                        🔗 Links ({links.length}/10)
                                    </Heading>

                                    {links.length > 0 && (
                                        <Stack gap="xs" className="showcase-mgmt__links-list">
                                            {links.map((link, i) => (
                                                <Stack key={i} direction="horizontal" align="center" justify="between" className="showcase-mgmt__link-item">
                                                    <Stack gap="xs">
                                                        <Paragraph className="showcase-mgmt__link-label">{link.label}</Paragraph>
                                                        <Paragraph size="sm" muted className="showcase-mgmt__link-url">{link.url}</Paragraph>
                                                    </Stack>
                                                    <Button
                                                        variant="danger"
                                                        size="small"
                                                        onClick={() => handleRemoveLink(i)}
                                                        disabled={savingLinks}
                                                    >
                                                        ×
                                                    </Button>
                                                </Stack>
                                            ))}
                                        </Stack>
                                    )}

                                    {links.length < 10 && (
                                        <Stack gap="sm" className="showcase-mgmt__add-link">
                                            <FormField label="Label">
                                                <Input
                                                    value={newLinkLabel}
                                                    onChange={(e) => setNewLinkLabel(e.target.value.slice(0, 50))}
                                                    placeholder="e.g. My Strava"
                                                    maxLength={50}
                                                />
                                                <Paragraph inline size="sm" muted className="showcase-mgmt__char-count">{newLinkLabel.length}/50</Paragraph>
                                            </FormField>
                                            <FormField label="URL">
                                                <Input
                                                    value={newLinkUrl}
                                                    onChange={(e) => setNewLinkUrl(e.target.value.slice(0, 200))}
                                                    placeholder="https://..."
                                                    maxLength={200}
                                                />
                                                <Paragraph inline size="sm" muted className="showcase-mgmt__char-count">{newLinkUrl.length}/200</Paragraph>
                                            </FormField>
                                            {linkError && (
                                                <Paragraph className="showcase-mgmt__slug-error">{linkError}</Paragraph>
                                            )}
                                            <Stack className="showcase-mgmt__actions">
                                                <Button
                                                    variant="primary"
                                                    size="small"
                                                    onClick={handleAddLink}
                                                    disabled={savingLinks || !newLinkLabel.trim() || !newLinkUrl.trim()}
                                                >
                                                    {savingLinks ? 'Saving…' : 'Add Link'}
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    )}
                                </Stack>
                            </Card>

                            <Card className="showcase-mgmt__section">
                                <Stack gap="md">
                                    <Heading level={3} className="showcase-mgmt__section-title">
                                        💬 Bio Callouts ({callouts.length}/10)
                                    </Heading>
                                    <Paragraph size="sm" muted>
                                        Short stat-chip lines shown under your bio. Great for quick facts like your location, height, or personal bests.
                                    </Paragraph>

                                    {callouts.length > 0 && (
                                        <Stack gap="xs" className="showcase-mgmt__links-list">
                                            {callouts.map((callout, i) => (
                                                <Stack key={i} direction="horizontal" align="center" justify="between" className="showcase-mgmt__link-item">
                                                    <Paragraph className="showcase-mgmt__link-label">{callout.text}</Paragraph>
                                                    <Button
                                                        variant="danger"
                                                        size="small"
                                                        onClick={() => handleRemoveCallout(i)}
                                                        disabled={savingCallouts}
                                                    >
                                                        ×
                                                    </Button>
                                                </Stack>
                                            ))}
                                        </Stack>
                                    )}

                                    {callouts.length < 10 && (
                                        <Stack gap="sm" className="showcase-mgmt__add-link">
                                            <FormField label="Callout text">
                                                <Input
                                                    value={newCalloutText}
                                                    onChange={(e) => { setNewCalloutText(e.target.value.slice(0, 150)); setCalloutError(''); }}
                                                    placeholder="e.g. 🇬🇧 Nottinghamshire, UK"
                                                    maxLength={150}
                                                />
                                                <Paragraph inline size="sm" muted className="showcase-mgmt__char-count">{newCalloutText.length}/150</Paragraph>
                                            </FormField>
                                            {calloutError && (
                                                <Paragraph className="showcase-mgmt__slug-error">{calloutError}</Paragraph>
                                            )}
                                            <Stack className="showcase-mgmt__actions">
                                                <Button
                                                    variant="primary"
                                                    size="small"
                                                    onClick={handleAddCallout}
                                                    disabled={savingCallouts || !newCalloutText.trim()}
                                                >
                                                    {savingCallouts ? 'Saving…' : 'Add Callout'}
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    )}
                                </Stack>
                            </Card>
                        </>
                    )}

                    {/* ── ROUNDUP ── */}
                    {activeSection === 'roundup' && (
                        <Card className="showcase-mgmt__section">
                            <Stack gap="md">
                                <Heading level={3} className="showcase-mgmt__section-title">
                                    📅 Roundup Pages
                                </Heading>
                                <Paragraph>
                                    Auto-generate a shareable training summary at the end of each period.
                                    Roundup pages are public and linked from your Showcase profile.
                                    Available on Athlete tier only.
                                </Paragraph>
                                <Toggle
                                    label="Weekly roundup"
                                    description={roundupWeekly
                                        ? `Generated every Monday · fitglue.tech/@${profile?.slug}/week-XX-YYYY`
                                        : 'Off — no weekly roundup page will be generated'}
                                    checked={roundupWeekly}
                                    onChange={() => handleSaveRoundupSettings(!roundupWeekly, roundupMonthly, roundupYearly)}
                                    disabled={savingRoundup}
                                />
                                <Toggle
                                    label="Monthly roundup"
                                    description={roundupMonthly
                                        ? `Generated on the 1st of each month · fitglue.tech/@${profile?.slug}/month-MM-YYYY`
                                        : 'Off — no monthly roundup page will be generated'}
                                    checked={roundupMonthly}
                                    onChange={() => handleSaveRoundupSettings(roundupWeekly, !roundupMonthly, roundupYearly)}
                                    disabled={savingRoundup}
                                />
                                <Toggle
                                    label="Yearly roundup"
                                    description={roundupYearly
                                        ? `Generated on 1 Jan each year · fitglue.tech/@${profile?.slug}/year-YYYY`
                                        : 'Off — no yearly roundup page will be generated'}
                                    checked={roundupYearly}
                                    onChange={() => handleSaveRoundupSettings(roundupWeekly, roundupMonthly, !roundupYearly)}
                                    disabled={savingRoundup}
                                />

                            </Stack>
                        </Card>
                    )}

                    {/* ── DANGER ZONE ── */}
                    {activeSection === 'danger' && (
                        <Card className="showcase-mgmt__section">
                            <Stack gap="md">
                                <Heading level={3} className="showcase-mgmt__section-title">
                                    ⊗ Danger Zone
                                </Heading>
                                <Toggle
                                    label="Profile visibility"
                                    description={profileVisible
                                        ? 'Your profile is publicly visible. Changes may take up to 5 minutes to reflect.'
                                        : 'Your profile is hidden — visitors will see a 404. Changes may take up to 5 minutes to reflect.'}
                                    checked={profileVisible}
                                    onChange={handleToggleVisibility}
                                />
                            </Stack>
                        </Card>
                    )}

                </div>

            {cropImage && (
                <ImageCropModal
                    imageSrc={cropImage}
                    onCropComplete={handleCropComplete}
                    onClose={handleCropCancel}
                />
            )}
        </SettingsLayout>
    );
};

export default ShowcaseManagementPage;
