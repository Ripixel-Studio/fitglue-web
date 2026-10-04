/**
 * UI Component Library - Barrel Export
 *
 * Import all reusable UI components from one place:
 * import { Button, Card, Pill, EmptyState, ConfirmDialog } from '../components/ui';
 */

// Core UI components
export { Button } from './Button';
export { Card } from './Card';
export { Text } from './Text';
export { LoadingState } from './LoadingState';
export { AppLoadingScreen } from './AppLoadingScreen';
export { MultiRingSpinner } from './MultiRingSpinner';

// Avatar
export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize, AvatarVariant } from './Avatar';

// ProgressBar
export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps, ProgressBarSize, ProgressBarVariant } from './ProgressBar';

// Header components
export { CardHeader } from './CardHeader';

// Status indicators
export { Pill } from './Pill';
export { StatusPill } from './StatusPill';
export { IdBadge } from './IdBadge';

// Dialog components
export { ConfirmDialog } from './ConfirmDialog';

// Empty states
export { EmptyState } from './EmptyState';

// Navigation
export { TabButton } from './TabButton';
export { LiveToggle } from './LiveToggle';
export { BackLink } from './BackLink';

// Flow visualization
export { BoosterPill } from './BoosterPill';
export { FlowArrow } from './FlowArrow';
export { FlowNode } from './FlowNode';

// Connection status
export { ConnectionStatusItem } from './ConnectionStatusItem';
export { ConnectionBanner } from './ConnectionBanner';

// Statistics
export { StatInline } from './StatInline';

// List components (legacy)
export { ListItem as ListItemLegacy } from './ListItem';

// Skeletons
export { CardSkeleton } from './CardSkeleton';
export { SkeletonLoading } from './SkeletonLoading';

// Icons
export { PluginIcon } from './PluginIcon';
export { PremiumBadge } from './PremiumBadge';

// Typography
export { Heading } from './Heading';
export { Paragraph, Text as TextBlock } from './Paragraph';

// Modal
export { Modal } from './Modal';

// Key-Value display
export { KeyValue } from './KeyValue';

// Icon button
export { IconButton } from './IconButton';

// List
export { List, ListItem } from './List';

// Code
export { Code, CodeBlock } from './Code';

// Badge
export { Badge } from './Badge';

// Provenance chip
export { ProvenanceChip } from './ProvenanceChip';
export type { ProvenanceChipProps } from './ProvenanceChip';

// Icon
export { Icon } from './Icon';

// Dashboard cards
export { DashboardSummaryCard } from './DashboardSummaryCard';

// Summary items
export { SummaryListItem } from './SummaryListItem';
export { PendingInputItem } from './PendingInputItem';

// Flow visualization
export { FlowVisualization } from './FlowVisualization';
export { GlowCard } from './GlowCard';
export { BoosterGrid } from './BoosterGrid';

// SVG asset renderer
export { SvgAsset } from './SvgAsset';
export type { SvgAssetProps } from './SvgAsset';

// Action cards
export { ActionCard } from './ActionCard';

// Tabbed cards
export { TabbedCard } from './TabbedCard';

// Table components
export {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableEmpty,
} from './Table';
export type {
  TableProps,
  TableHeadProps,
  TableBodyProps,
  TableRowProps,
  TableHeaderCellProps,
  TableCellProps,
  TableEmptyProps,
  TableVariant,
  TableAlign,
  SortDirection,
} from './Table';

// DataTable (high-level composition)
export { DataTable } from './DataTable';
export type { DataTableProps, DataTableColumn } from './DataTable';

// Pagination
export { Pagination } from './Pagination';
export type { PaginationProps } from './Pagination';

// Filter components
export { FilterBar, FilterField } from './FilterBar';
export type { FilterBarProps, FilterFieldProps } from './FilterBar';

// Toast notifications
export { ToastProvider, useToast } from './Toast';
export type { Toast, ToastVariant, ToastContextValue } from './Toast';

// Accordion
export { AccordionTrigger } from './Accordion';

// Expandable cards
export { ExpandableCard } from './ExpandableCard';

// Destination badge
export { DestinationBadge } from './DestinationBadge';

// Transformation preview
export { TransformationPreview } from './TransformationPreview';

// Link
export { Link } from './Link';
export type { LinkProps } from './Link';

// Run row (pipeline run feed row)
export { RunRow } from './RunRow';
export type { RunRowProps } from './RunRow';

// Pipeline summary card (dashboard + pipelines list)
export { PipelineSummaryCard } from './PipelineSummaryCard';
export type { PipelineSummaryCardProps } from './PipelineSummaryCard';

// Dashboard heading slab
export { DashboardHeading, Gr } from './DashboardHeading';
export type { DashboardHeadingProps, DashboardStat } from './DashboardHeading';

// Dashboard sub-band opener
export { DashboardBand } from './DashboardBand';
export type { DashboardBandProps } from './DashboardBand';

// Dashboard aurora plan band
export { DashboardPlanBand } from './DashboardPlanBand';
export type { DashboardPlanBandProps } from './DashboardPlanBand';

// Countdown ring (SVG circular timer with aurora gradient)
export { CountdownRing } from './CountdownRing';
export type { CountdownRingProps } from './CountdownRing';

// Source / Destination / Booster pickers (wizard + pipeline steps)
export { SourcePicker } from './SourcePicker';
export type { SourcePickerProps, SourceTile } from './SourcePicker';
export { DestinationPicker } from './DestinationPicker';
export type { DestinationPickerProps, DestinationChip } from './DestinationPicker';
export { BoosterPicker } from './BoosterPicker';
export type { BoosterPickerProps, BoosterChip } from './BoosterPicker';

// Plan + usage display
export { PlanBand } from './PlanBand';
export type { PlanBandProps } from './PlanBand';
export { UsageGrid } from './UsageGrid';
export type { UsageGridProps, UsageCell } from './UsageGrid';

// Changelog
export { ChangelogEntry, ChangelogTagRow } from './ChangelogEntry';
export type { ChangelogEntryProps, ChangelogTag, ChangelogTagVariant } from './ChangelogEntry';
