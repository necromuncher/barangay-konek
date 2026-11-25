import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 3200,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['app-toast', 'app-toast-success'],
    });
  }

  error(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 5500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['app-toast', 'app-toast-error'],
    });
  }
}
