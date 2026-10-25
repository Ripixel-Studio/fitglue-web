import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '../../shared/logger';
import { useAtom } from 'jotai';
import { updateProfile } from 'firebase/auth';
import { client } from '../../shared/api/client';
import { useUser } from '../hooks/useUser';
import { useAuth } from '../hooks/useAuth';
import { userAtom } from '../state/authState';
import { getEffectiveTier, TIER_ATHLETE, TIER_HOBBYIST, HOBBYIST_TIER_LIMITS } from '../utils/tier';
import { ReauthModal } from '../components/ReauthModal';
import { useToast, Button, Badge } from '../components/library/ui';
import { SettingsLayout } from '../components/library/layout';
import { Input } from '../components/library/forms';

const AccountSettingsPage: React.FC = () => {
    const [firebaseUser] = useAtom(userAtom);
    const { user: profile } = useUser();
    const toast = useToast();
    const { changePassword } = useAuth();
    const navigate = useNavigate();

    // Name editing
    const [editedName, setEditedName] = useState('');
    const [savingName, setSavingName] = useState(false);

    // Email editing
    const [editedEmail, setEditedEmail] = useState('');
    const [savingEmail, setSavingEmail] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [emailError, setEmailError] = useState('');

    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // Reauth modal state
    const [showReauthModal, setShowReauthModal] = useState(false);

    // Data export state
    const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'completed' | 'failed'>('idle');
    const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    useEffect(() => {
        if (firebaseUser?.displayName) {
            setEditedName(firebaseUser.displayName);
        }
        if (firebaseUser?.email) {
            setEditedEmail(firebaseUser.email);
        }
    }, [firebaseUser?.displayName, firebaseUser?.email]);

    const isNameDirty = editedName.trim() !== (firebaseUser?.displayName || '');
    const isEmailDirty = editedEmail.trim() !== (firebaseUser?.email || '');

    const handleSaveName = async () => {
        if (!firebaseUser || !editedName.trim()) return;
        setSavingName(true);
        try {
            await updateProfile(firebaseUser, { displayName: editedName.trim() });
            await firebaseUser.reload();
            toast.success('Name Updated', 'Your display name has been saved');
        } catch (err) {
            logger.error('Failed to update name:', err);
            toast.error('Update Failed', 'Failed to update name. Please try again.');
        } finally {
            setSavingName(false);
        }
    };

    const handleSaveEmail = async () => {
        if (!firebaseUser || !editedEmail.trim()) return;
        if (editedEmail.trim() === firebaseUser.email) return;
        setSavingEmail(true);
        setEmailError('');
        setEmailSent(false);
        try {
            await client.POST('/users/me/auth-email/send-email-change', { body: { newEmail: editedEmail.trim() } as never });
            setEmailSent(true);
            toast.info('Verification Sent', `Check ${editedEmail} for the verification link`);
        } catch (err: unknown) {
            logger.error('Failed to send email change verification:', err);
            const errorMsg = err instanceof Error ? err.message : 'Failed to send verification email';
            setEmailError(errorMsg);
            toast.error('Email Update Failed', errorMsg);
        } finally {
            setSavingEmail(false);
        }
    };

    const handleReauthSuccess = () => {
        setShowReauthModal(false);
        handleSaveEmail();
    };

    const handleChangePassword = async () => {
        setPasswordError('');
        setPasswordSuccess('');
        if (!currentPassword) { setPasswordError('Current password is required'); return; }
        if (newPassword.length < 6) { setPasswordError('New password must be at least 6 characters'); return; }
        if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
        setChangingPassword(true);
        const success = await changePassword(currentPassword, newPassword);
        setChangingPassword(false);
        if (success) {
            setPasswordSuccess('Password updated successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            toast.success('Password Changed', 'Your password has been updated');
        } else {
            setPasswordError('Failed to change password. Check your current password and try again.');
        }
    };

    const hasPasswordProvider = firebaseUser?.providerData?.some(
        (p) => p.providerId === 'password'
    ) ?? false;


    const handleDeleteAccount = async () => {
        if (deleteConfirmation !== 'DELETE') { setDeleteError('Please type DELETE to confirm'); return; }
        setDeleting(true);
        setDeleteError(null);
        try {
            await client.DELETE('/users/me');
            window.location.href = '/auth/logout';
        } catch (err) {
            logger.error('Failed to delete account:', err);
            setDeleteError('Failed to delete account. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    // The whole-account export is built asynchronously: POST enqueues a job, then
    // we poll until it is READY (download link) or FAILED.
    const pollExportJob = async (jobId: string) => {
        const maxAttempts = 60; // ~3 minutes at 3s intervals
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const { data } = await client.GET('/users/me/export/{jobId}', {
                params: { path: { jobId } },
            });
            if (data?.status === 'READY' && data.downloadUrl) {
                setExportStatus('completed');
                setExportDownloadUrl(data.downloadUrl);
                toast.success('Export Ready', 'Your data export is ready to download');
                return;
            }
            if (data?.status === 'FAILED') {
                throw new Error(data.error || 'Export failed');
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        throw new Error('Export timed out');
    };

    const handleExportData = async () => {
        setExportStatus('loading');
        setExportError(null);
        setExportDownloadUrl(null);
        try {
            const { data } = await client.POST('/users/me/export');
            const jobId = data?.jobId;
            if (!jobId) throw new Error('No job id in response');
            await pollExportJob(jobId);
        } catch (err) {
            logger.error('Failed to export data:', err);
            setExportStatus('failed');
            setExportError('Failed to generate data export');
            toast.error('Export Failed', 'Could not generate data export');
        }
    };

    const effectiveTier = profile ? getEffectiveTier(profile) : TIER_HOBBYIST;
    const isAthlete = effectiveTier === TIER_ATHLETE;
    const maxSyncs = isAthlete ? '∞' : String(HOBBYIST_TIER_LIMITS.SYNCS_PER_MONTH);
    const syncsUsed = profile?.syncCountThisMonth ?? 0;

    const getInitial = () => {
        if (firebaseUser?.displayName) return firebaseUser.displayName[0].toUpperCase();
        if (firebaseUser?.email) return firebaseUser.email[0].toUpperCase();
        return '?';
    };

    return (
        <SettingsLayout title="Account">
            <div>
                    {/* Plan banner */}
                    <div className="stx-plan">
                        <span className="stx-plan__icon">✦</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                            <span className="stx-plan__title">
                                {isAthlete ? 'ATHLETE · UNLIMITED SYNCS' : 'HOBBYIST'}
                            </span>
                            <span className="stx-plan__meta">
                                {syncsUsed} / {maxSyncs} SYNCS THIS MONTH
                            </span>
                        </div>
                        <Button variant="ink" size="sm" onClick={() => navigate('/settings/subscription')}>
                            {isAthlete ? 'MANAGE →' : 'UPGRADE →'}
                        </Button>
                    </div>

                    {/* Profile section */}
                    <section className="stx-section">
                        <div className="stx-section__head">
                            <div>
                                <h2>YOUR PROFILE</h2>
                                <p className="stx-section__sub">How you appear on Showcase pages.</p>
                            </div>
                        </div>
                        <div className="stx-section__body">
                            {/* Avatar */}
                            <div className="settings-field">
                                <div><div className="settings-field__label-name">Avatar</div></div>
                                <div className="stx-field__input">
                                    <div className="stx-avatar-row">
                                        <div className="stx-avatar">{getInitial()}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                            <span style={{ fontFamily: 'var(--fg-font-mono)', fontSize: '0.6875rem', letterSpacing: '0.1em', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                                Managed via Showcase settings
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Display Name */}
                            <div className="settings-field">
                                <div><div className="settings-field__label-name">Display Name</div><div className="settings-field__label-hint">How you appear on Showcase pages.</div></div>
                                <div className="stx-field__input">
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', maxWidth: 480 }}>
                                        <Input
                                            type="text"
                                            value={editedName}
                                            onChange={(e) => setEditedName(e.target.value)}
                                            placeholder="Your name"
                                            disabled={savingName}
                                            style={{ flex: 1 }}
                                        />
                                        {isNameDirty && (
                                            <Button
                                                size="sm"
                                                onClick={handleSaveName}
                                                disabled={savingName || !editedName.trim()}
                                            >
                                                {savingName ? 'SAVING…' : 'SAVE'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Email */}
                            <div className="settings-field">
                                <div><div className="settings-field__label-name">Email</div><div className="settings-field__label-hint">Change requires re-verification.</div></div>
                                <div className="stx-field__input">
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', maxWidth: 480 }}>
                                        <Input
                                            type="email"
                                            value={editedEmail}
                                            onChange={(e) => {
                                                setEditedEmail(e.target.value);
                                                setEmailSent(false);
                                                setEmailError('');
                                            }}
                                            placeholder="your@email.com"
                                            disabled={savingEmail}
                                            style={{ flex: 1 }}
                                        />
                                        {isEmailDirty && !emailSent && (
                                            <Button
                                                size="sm"
                                                onClick={handleSaveEmail}
                                                disabled={savingEmail || !editedEmail.trim()}
                                            >
                                                {savingEmail ? 'SENDING…' : 'SAVE'}
                                            </Button>
                                        )}
                                    </div>
                                    {emailSent && (
                                        <p className="stx-field__help">
                                            <span style={{ marginRight: '0.5rem' }}><Badge variant="success">✓ SENT</Badge></span>
                                            Check {editedEmail} for the verification link.
                                        </p>
                                    )}
                                    {emailError && (
                                        <p className="stx-field__help" style={{ color: 'var(--fg-rose)' }}>{emailError}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Security section */}
                    {hasPasswordProvider && (
                        <section className="stx-section">
                            <div className="stx-section__head">
                                <div>
                                    <h2>LOGIN &amp; SECURITY</h2>
                                    <p className="stx-section__sub">Email, password, two-factor.</p>
                                </div>
                            </div>
                            <div className="stx-section__body">
                                <div className="settings-field">
                                    <div><div className="settings-field__label-name">Current Password</div></div>
                                    <div className="stx-field__input">
                                        <Input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); setPasswordSuccess(''); }}
                                            placeholder="Enter current password"
                                            disabled={changingPassword}
                                        />
                                    </div>
                                </div>
                                <div className="settings-field">
                                    <div><div className="settings-field__label-name">New Password</div><div className="settings-field__label-hint">Min 6 characters.</div></div>
                                    <div className="stx-field__input">
                                        <Input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); setPasswordSuccess(''); }}
                                            placeholder="Min 6 characters"
                                            disabled={changingPassword}
                                        />
                                    </div>
                                </div>
                                <div className="settings-field">
                                    <div><div className="settings-field__label-name">Confirm Password</div></div>
                                    <div className="stx-field__input">
                                        <Input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); setPasswordSuccess(''); }}
                                            placeholder="Re-enter new password"
                                            disabled={changingPassword}
                                        />
                                        {passwordError && <p className="stx-field__help" style={{ color: 'var(--fg-rose)' }}>{passwordError}</p>}
                                        {passwordSuccess && <p className="stx-field__help" style={{ color: 'var(--fg-green)' }}>{passwordSuccess}</p>}
                                        <div style={{ marginTop: '0.75rem' }}>
                                            <Button
                                                size="sm"
                                                onClick={handleChangePassword}
                                                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                                            >
                                                {changingPassword ? 'CHANGING…' : 'CHANGE PASSWORD'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Data Rights section */}
                    <section className="stx-section">
                        <div className="stx-section__head">
                            <div>
                                <h2>DATA RIGHTS</h2>
                                <p className="stx-section__sub">GDPR — your right to access, rectify, and delete your personal data.</p>
                            </div>
                        </div>
                        <div className="stx-section__body">
                            <div className="settings-field">
                                <div><div className="settings-field__label-name">Export Data</div><div className="settings-field__label-hint">GDPR right to portability.</div></div>
                                <div className="stx-field__input">
                                    {exportStatus === 'idle' && (
                                        <Button variant="ink" size="sm" onClick={handleExportData}>
                                            DOWNLOAD MY DATA
                                        </Button>
                                    )}
                                    {exportStatus === 'loading' && (
                                        <Button variant="ink" size="sm" disabled>
                                            ⏳ PREPARING…
                                        </Button>
                                    )}
                                    {exportStatus === 'completed' && exportDownloadUrl && (
                                        <>
                                            <a href={exportDownloadUrl} className="fg-button fg-button--sm">
                                                DOWNLOAD EXPORT (ZIP)
                                            </a>
                                            <p className="stx-field__help">Link expires in 24 hours. A copy was also sent to your email.</p>
                                        </>
                                    )}
                                    {exportStatus === 'failed' && (
                                        <>
                                            <p className="stx-field__help" style={{ color: 'var(--fg-rose)' }}>{exportError}</p>
                                            <Button variant="ink" size="sm" onClick={handleExportData}>
                                                TRY AGAIN
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Danger Zone */}
                    <div className="stx-danger">
                        <h3>DANGER ZONE</h3>
                        <div className="settings-field" style={{ borderBottom: 0 }}>
                            <div><div className="settings-field__label-name">Delete Account</div><div className="settings-field__label-hint">Permanent and irreversible.</div></div>
                            <div className="stx-field__input">
                                <p className="stx-field__help" style={{ marginBottom: '0.75rem' }}>
                                    This action is <strong style={{ color: 'var(--fg-paper)' }}>permanent and irreversible</strong>.
                                    Removes your profile, pipelines, run history and all synced activities.
                                </p>
                                <Input
                                    type="text"
                                    value={deleteConfirmation}
                                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                                    placeholder="Type DELETE to confirm"
                                    disabled={deleting}
                                    style={{ maxWidth: 320, marginBottom: '0.75rem' }}
                                />
                                {deleteError && <p className="stx-field__help" style={{ color: 'var(--fg-rose)', marginBottom: '0.75rem' }}>{deleteError}</p>}
                                <div>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={handleDeleteAccount}
                                        disabled={deleteConfirmation !== 'DELETE' || deleting}
                                    >
                                        {deleting ? 'DELETING…' : 'DELETE ACCOUNT & ALL DATA'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            {/* Re-authentication Modal */}
            {firebaseUser && hasPasswordProvider && (
                <ReauthModal
                    user={firebaseUser}
                    isOpen={showReauthModal}
                    onSuccess={handleReauthSuccess}
                    onCancel={() => setShowReauthModal(false)}
                    description="Your session has expired. Please enter your password to continue changing your email."
                />
            )}
        </SettingsLayout>
    );
};

export default AccountSettingsPage;
