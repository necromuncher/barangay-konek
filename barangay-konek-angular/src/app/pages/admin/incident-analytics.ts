import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { CommunityWallService, IncidentStatus, Severity, WallPost } from '../../community-wall.service';

type IncidentPeriod = 'month' | 'year' | 'all';

interface IncidentMetric {
  key: IncidentStatus;
  label: string;
  count: number;
  color: string;
}

interface SeverityMetric {
  key: Severity;
  label: string;
  count: number;
  color: string;
}

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

@Component({
  imports: [MatIconModule, RouterLink],
  selector: 'app-incident-analytics',
  styleUrl: './incident-analytics.scss',
  templateUrl: './incident-analytics.html',
})
export class IncidentAnalytics implements OnInit, OnDestroy {
  @Input({ required: true }) incidents: WallPost[] = [];
  @Input() showSeverity = false;

  private readonly wall = inject(CommunityWallService);
  private rotationTimer: number | undefined;
  readonly period = signal<IncidentPeriod>('month');
  readonly hoveredStatus = signal<IncidentStatus | null>(null);
  readonly selectedSeverity = signal<Severity | null>(null);
  readonly recentIncidentIndex = signal(0);
  readonly rotationPaused = signal(false);

  ngOnInit(): void {
    if (!this.showSeverity) return;
    this.selectedSeverity.set('low');
    this.rotationTimer = window.setInterval(() => this.rotateSeverityRecent(), 5000);
  }

  ngOnDestroy(): void {
    if (this.rotationTimer !== undefined) window.clearInterval(this.rotationTimer);
  }

  get periodLabel(): string {
    if (this.period() === 'month') return 'This month';
    if (this.period() === 'year') return 'This year';
    return 'All time';
  }

  get filteredIncidents(): WallPost[] {
    const now = new Date();
    const start = this.period() === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      : this.period() === 'year'
        ? new Date(now.getFullYear(), 0, 1).getTime()
        : Number.NEGATIVE_INFINITY;
    return this.incidents.filter((incident) => {
      const createdAt = this.wall.incidentCreatedAt(incident);
      return createdAt >= start && createdAt <= now.getTime();
    });
  }

  get metrics(): IncidentMetric[] {
    const incidents = this.filteredIncidents;
    const countFor = (status: IncidentStatus) =>
      incidents.filter((incident) => this.wall.incidentStatus(incident) === status).length;
    return [
      { key: 'resolved', label: 'Resolved', count: countFor('resolved'), color: '#29805d' },
      { key: 'active', label: 'Open / Active', count: countFor('active'), color: '#4585d2' },
      { key: 'unresolved', label: 'Unresolved', count: countFor('unresolved'), color: '#d58a32' },
    ];
  }

  get totalIncidents(): number {
    return this.filteredIncidents.length;
  }

  get severityMetrics(): SeverityMetric[] {
    const incidents = this.filteredIncidents;
    const severities: Array<{ key: Severity; label: string; color: string }> = [
      { key: 'low', label: 'Low', color: '#29805d' },
      { key: 'medium', label: 'Medium', color: '#d3a33b' },
      { key: 'high', label: 'High', color: '#d97832' },
      { key: 'critical', label: 'Critical', color: '#c94f58' },
    ];
    return severities.map((severity) => ({
      ...severity,
      count: incidents.filter((incident) => incident.severity === severity.key).length,
    }));
  }

  get totalSeverityIncidents(): number {
    return this.severityMetrics.reduce((total, metric) => total + metric.count, 0);
  }

  severityBarWidth(count: number): number {
    const maximum = Math.max(1, ...this.severityMetrics.map((metric) => metric.count));
    return count ? Math.max(3, count / maximum * 100) : 0;
  }

  get recentSeverityIncidents(): WallPost[] {
    const severity = this.selectedSeverity();
    if (!severity) return [];
    return this.filteredIncidents
      .filter((incident) => incident.severity === severity)
      .sort((first, second) =>
        this.wall.incidentCreatedAt(second) - this.wall.incidentCreatedAt(first))
      .slice(0, 5);
  }

  get visibleRecentIncident(): WallPost | undefined {
    return this.recentSeverityIncidents[this.recentIncidentIndex()];
  }

  severityLabel(severity: Severity): string {
    return severity.charAt(0).toUpperCase() + severity.slice(1);
  }

  selectSeverity(severity: Severity): void {
    this.selectedSeverity.set(severity);
    this.recentIncidentIndex.set(0);
  }

  setPeriod(period: IncidentPeriod): void {
    this.period.set(period);
    this.recentIncidentIndex.set(0);
  }

  toggleRotation(): void {
    this.rotationPaused.update((paused) => !paused);
  }

  get hoveredMetric(): IncidentMetric | undefined {
    return this.metrics.find((metric) => metric.key === this.hoveredStatus());
  }

  get donutSegments(): Array<IncidentMetric & { dashArray: string; dashOffset: number }> {
    const circumference = 2 * Math.PI * 56;
    const total = this.totalIncidents;
    let offset = 0;
    return this.metrics.map((metric) => {
      const length = total ? metric.count / total * circumference : 0;
      const segment = {
        ...metric,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: -offset,
      };
      offset += length;
      return segment;
    });
  }

  barHeight(count: number): number {
    const maximum = Math.max(1, ...this.metrics.map((metric) => metric.count));
    return count ? Math.max(5, count / maximum * 100) : 0;
  }

  hover(status: IncidentStatus): void {
    this.hoveredStatus.set(status);
  }

  clearHover(status: IncidentStatus): void {
    if (this.hoveredStatus() === status) this.hoveredStatus.set(null);
  }

  private rotateSeverityRecent(): void {
    if (this.rotationPaused()) return;
    const currentSeverity = this.selectedSeverity();
    if (!currentSeverity) return;

    const incidents = this.recentSeverityIncidents;
    const currentIndex = this.recentIncidentIndex();
    if (incidents.length && currentIndex < incidents.length - 1) {
      this.recentIncidentIndex.set(currentIndex + 1);
      return;
    }

    const severityIndex = SEVERITY_ORDER.indexOf(currentSeverity);
    this.selectedSeverity.set(SEVERITY_ORDER[(severityIndex + 1) % SEVERITY_ORDER.length]);
    this.recentIncidentIndex.set(0);
  }
}
