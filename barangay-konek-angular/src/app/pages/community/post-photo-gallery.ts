import { Component, Input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  imports: [MatIconModule, MatButtonModule],
  selector: 'app-post-photo-gallery',
  styleUrl: './post-photo-gallery.scss',
  templateUrl: './post-photo-gallery.html',
})
export class PostPhotoGallery {
  @Input({ required: true }) photos: string[] = [];
  @Input({ required: true }) title = '';
  @Input() mode: 'thumbnail' | 'detail' = 'detail';

  readonly currentIndex = signal(0);
  readonly lightboxOpen = signal(false);

  select(index: number): void {
    if (!this.photos.length) return;
    this.currentIndex.set((index + this.photos.length) % this.photos.length);
  }

  previous(): void {
    this.select(this.currentIndex() - 1);
  }

  next(): void {
    this.select(this.currentIndex() + 1);
  }
}
