<?php

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Users\Models\User;

class NotificationPreferenceService
{
    public const EMPLOYEE_SETTING_KEYS = [
        'request_submissions',
        'status_updates',
        'admin_comments',
        'near_deadline_reminders',
        'overdue_alerts',
    ];

    public const ADMIN_SETTING_KEYS = [
        'admin_new_requests',
        'admin_employee_updates',
        'admin_overdue_liquidations',
    ];

    /**
     * Map notification type strings to their governing NotificationSetting column.
     * Returns null for in-app-only notifications (e.g. My Expense draft receipt upload/OCR).
     */
    public static function resolveSettingKey(string $notificationType, ?User $recipient = null): ?string
    {
        return match ($notificationType) {
            // Employee: 1. Request submissions (G2-075 Task 1, G2-078 Task 3)
            'reimbursement_submitted',
            'cash_advance_submitted',
            'liquidation_submitted' => 'request_submissions',

            // Employee: 2. Status updates (G2-075 Task 2 & 3, G2-078 Task 3)
            'reimbursement_approved',
            'reimbursement_rejected',
            'reimbursement_revised',
            'reimbursement_cancelled',
            'reimbursement_granted',
            'payout_acknowledged',
            'cash_advance_approved',
            'cash_advance_rejected',
            'cash_advance_revised',
            'cash_advance_cancelled',
            'cash_advance_disbursed',
            'liquidation_settled',
            'liquidation_approved',
            'liquidation_rejected',
            'liquidation_revised',
            'liquidation_cancelled',
            'receipt_auto_rejected' => 'status_updates',

            // Employee: 3. Admin comments and notes (G2-075 Task 3, G2-078 Task 3)
            'reimbursement_admin_note',
            'receipt_admin_note',
            'cash_advance_admin_note',
            'liquidation_admin_note' => 'admin_comments',

            // Employee: 4. Near-deadline reminders (G2-077 Task 1, G2-078 Task 3)
            'liquidation_due_soon',
            'liquidation_due_today' => 'near_deadline_reminders',

            // Employee: 5. Overdue alerts (G2-077 Task 2, G2-078 Task 3)
            'liquidation_overdue' => 'overdue_alerts',

            // Admin: 1. New requests from employees (G2-076 Task 1, G2-078 Task 3)
            'admin_reimbursement_submitted',
            'admin_cash_advance_submitted',
            'admin_liquidation_submitted' => 'admin_new_requests',

            // Admin: 2. Employee notes, signatures, uploads & resubmissions (G2-076 Task 2, G2-078 Task 3)
            'admin_employee_note_added',
            'admin_payout_signed',
            'admin_cash_advance_signed',
            'admin_reimbursement_resubmitted',
            'admin_cash_advance_resubmitted',
            'admin_liquidation_resubmitted',
            'admin_receipt_resubmitted',
            'admin_file_uploaded' => 'admin_employee_updates',

            // Admin: 3. Overdue liquidations (G2-077 Task 2, G2-078 Task 3)
            'admin_liquidation_overdue' => 'admin_overdue_liquidations',

            default => null,
        };
    }

    /**
     * Determine whether a user is considered an Admin in SERMS.
     */
    public static function isAdminUser(User $user): bool
    {
        $dept = strtolower(trim((string) ($user->department ?? '')));
        $role = strtolower(trim((string) ($user->role ?? '')));

        return $dept === 'accounting' || in_array($role, ['admin', 'superadmin', 'finance', 'accounting'], true);
    }

    /**
     * Retrieve or initialize notification settings for a user (all On by default per G2-078).
     */
    public static function getForUser(int $userId): NotificationSetting
    {
        return NotificationSetting::firstOrCreate(
            ['user_id' => $userId],
            [
                'email_enabled' => true,
                'request_submissions' => true,
                'status_updates' => true,
                'admin_comments' => true,
                'near_deadline_reminders' => true,
                'overdue_alerts' => true,
                'admin_new_requests' => true,
                'admin_employee_updates' => true,
                'admin_overdue_liquidations' => true,
            ]
        );
    }

    /**
     * Evaluate whether an email should be sent for the given user and notification type.
     *
     * @return array{allowed: bool, setting_key: ?string, reason: ?string}
     */
    public static function shouldSendEmail(User $recipient, string $notificationType): array
    {
        $settingKey = self::resolveSettingKey($notificationType, $recipient);

        if ($settingKey === null) {
            return [
                'allowed' => false,
                'setting_key' => null,
                'reason' => 'in_app_only',
            ];
        }

        $settings = self::getForUser((int) $recipient->id);

        if (!$settings->email_enabled) {
            return [
                'allowed' => false,
                'setting_key' => $settingKey,
                'reason' => 'skipped by user setting',
            ];
        }

        if (! (bool) ($settings->{$settingKey} ?? true)) {
            return [
                'allowed' => false,
                'setting_key' => $settingKey,
                'reason' => 'skipped by user setting',
            ];
        }

        return [
            'allowed' => true,
            'setting_key' => $settingKey,
            'reason' => null,
        ];
    }
}
