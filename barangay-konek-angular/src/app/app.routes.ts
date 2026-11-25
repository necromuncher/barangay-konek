import { Routes } from '@angular/router';
import { AppShell } from './app-shell/app-shell';
import { AuthComponent } from './auth/auth.component';
import { adminGuard, authGuard, superuserGuard } from './auth/auth.guard';
import { Dashboard } from './pages/dashboard/dashboard';
import { Community } from './pages/community/community';
import { Marketplace } from './pages/marketplace/marketplace';
import { Admin } from './pages/admin/admin';
import { Profile } from './pages/profile/profile';
import { Messages } from './pages/messages/messages';
import { ListingDetail } from './pages/marketplace/listing-detail';
import { SystemLogs } from './pages/system-logs/system-logs';
import { PublicHome } from './pages/public-home/public-home';

export const routes: Routes = [
  { path: 'auth', component: AuthComponent },
  { path: '', pathMatch: 'full', component: PublicHome },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: Dashboard },
      { path: 'community', component: Community },
      { path: 'marketplace/:id', component: ListingDetail },
      { path: 'marketplace', component: Marketplace },
      { path: 'admin', component: Admin, canActivate: [adminGuard] },
      { path: 'system-logs', component: SystemLogs, canActivate: [superuserGuard] },
      { path: 'profile', component: Profile },
      { path: 'messages', component: Messages },
    ],
  },
  { path: '**', redirectTo: '' },
];
