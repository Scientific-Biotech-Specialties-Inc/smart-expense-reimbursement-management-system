<?php

namespace App\Modules\Notifications\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Models\Notification;
use App\Modules\AuditLogs\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    private function normalizeModuleFilter(?string $module): ?string
    {
        if (!$module) {
            return null;
        }

        $clean = strtolower(trim($module));
        return match ($clean) {
            'reimbursement', 'reimbursements' => 'Reimbursement',
            'cash advance', 'cash advances', 'cash-advance', 'cash-advances', 'cash_advance' => 'Cash Advance',
            'liquidation', 'liquidations' => 'Liquidation',
            'my expense', 'my expenses', 'my-expense', 'expense', 'expenses' => 'My Expense',
            default => null,
        };
    }

    /**
     * List authenticated user's notifications from newest to oldest.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        if ($request->filled('user_id') && (int) $request->query('user_id') !== (int) $user->id) {
            return response()->json([
                'message' => 'Forbidden. You cannot view another user\'s notifications.',
            ], 403);
        }

        $query = Notification::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        $moduleFilter = $this->normalizeModuleFilter($request->query('module'));
        if ($moduleFilter) {
            $query->where('module', $moduleFilter);
        }

        if ($request->boolean('unread') || strtolower((string) $request->query('filter')) === 'unread') {
            $query->where('is_read', false);
        }

        $limit = $request->query('limit');
        if ($limit !== null && is_numeric($limit)) {
            $query->limit(max(1, min((int) $limit, 200)));
        }

        $notifications = $query->get();

        $unreadCount = Notification::query()
            ->where('user_id', $user->id)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'data' => $notifications,
            'unread_count' => $unreadCount,
        ]);
    }

    /**
     * Mark a single notification as read. Returns 403 if owned by another user.
     */
    public function markRead(Request $request, int $id)
    {
        $user = $request->user();
        $notification = Notification::findOrFail($id);

        if ((int) $notification->user_id !== (int) $user->id) {
            return response()->json([
                'message' => 'Forbidden. You cannot access or modify another user\'s notification.',
            ], 403);
        }

        if (!$notification->is_read) {
            DB::transaction(function () use ($notification, $user, $request) {
                $before = $notification->toArray();
                $notification->update([
                    'is_read' => true,
                    'read_at' => now(),
                ]);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) ($user->role ?? 'employee'),
                    actionType: 'NOTIFICATION_READ',
                    entityType: 'notification',
                    entityId: $notification->id,
                    beforeState: $before,
                    afterState: $notification->fresh()->toArray(),
                    ipAddress: $request->ip()
                );
            });
        }

        $unreadCount = Notification::query()
            ->where('user_id', $user->id)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'message' => 'Notification marked as read.',
            'data' => $notification->fresh(),
            'unread_count' => $unreadCount,
        ]);
    }

    /**
     * Mark all unread notifications for the authenticated user as read.
     */
    public function markAllRead(Request $request)
    {
        $user = $request->user();

        DB::transaction(function () use ($user, $request) {
            $updatedCount = Notification::query()
                ->where('user_id', $user->id)
                ->where('is_read', false)
                ->update([
                    'is_read' => true,
                    'read_at' => now(),
                    'updated_at' => now(),
                ]);

            if ($updatedCount > 0) {
                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) ($user->role ?? 'employee'),
                    actionType: 'NOTIFICATIONS_MARKED_ALL_READ',
                    entityType: 'notification',
                    entityId: $user->id,
                    beforeState: ['unread_updated' => $updatedCount],
                    afterState: ['unread_count' => 0],
                    ipAddress: $request->ip()
                );
            }
        });

        return response()->json([
            'message' => 'All notifications marked as read.',
            'unread_count' => 0,
        ]);
    }

    /**
     * Retrieve the authenticated user's email notification settings (G2-078).
     */
    public function getSettings(Request $request)
    {
        $user = $request->user();
        $settings = \App\Modules\Notifications\Services\NotificationPreferenceService::getForUser((int) $user->id);
        $isAdmin = \App\Modules\Notifications\Services\NotificationPreferenceService::isAdminUser($user);

        return response()->json([
            'data' => $settings,
            'role_scope' => $isAdmin ? 'admin' : 'employee',
        ]);
    }

    /**
     * Update the authenticated user's email notification settings (G2-078, G2-079).
     */
    public function updateSettings(Request $request)
    {
        $user = $request->user();
        $validated = $request->validate([
            'email_enabled' => ['sometimes', 'boolean'],
            'request_submissions' => ['sometimes', 'boolean'],
            'status_updates' => ['sometimes', 'boolean'],
            'admin_comments' => ['sometimes', 'boolean'],
            'near_deadline_reminders' => ['sometimes', 'boolean'],
            'overdue_alerts' => ['sometimes', 'boolean'],
            'admin_new_requests' => ['sometimes', 'boolean'],
            'admin_employee_updates' => ['sometimes', 'boolean'],
            'admin_overdue_liquidations' => ['sometimes', 'boolean'],
        ]);

        $settings = \App\Modules\Notifications\Services\NotificationPreferenceService::getForUser((int) $user->id);

        DB::transaction(function () use ($settings, $validated, $user, $request) {
            $before = $settings->toArray();
            $settings->update($validated);

            AuditLogService::log(
                actorId: $user->id,
                actorRole: (string) ($user->role ?? 'employee'),
                actionType: 'NOTIFICATION_SETTINGS_UPDATED',
                entityType: 'notification_setting',
                entityId: $settings->id,
                beforeState: $before,
                afterState: $settings->fresh()->toArray(),
                ipAddress: $request->ip()
            );
        });

        $isAdmin = \App\Modules\Notifications\Services\NotificationPreferenceService::isAdminUser($user);

        return response()->json([
            'message' => 'Notification settings saved successfully.',
            'data' => $settings->fresh(),
            'role_scope' => $isAdmin ? 'admin' : 'employee',
        ]);
    }
}
