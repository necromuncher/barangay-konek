import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { CommunityWallService } from '../../community-wall.service';

@Component({
  imports: [DatePipe, MatCardModule, MatIconModule],
  selector: 'app-system-logs',
  styleUrl: './system-logs.scss',
  templateUrl: './system-logs.html',
})
export class SystemLogs {
  readonly wall = inject(CommunityWallService);
  readonly search = signal('');

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  get logs() {
    const query = this.search().trim().toLocaleLowerCase();
    return this.wall.systemLogs().filter((log) =>
      !query || `${log.actorName} ${log.actorId} ${log.action} ${log.barangayName}`
        .toLocaleLowerCase().includes(query));
  }
}
