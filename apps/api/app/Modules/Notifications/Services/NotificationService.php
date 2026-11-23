<?php

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Jobs\SendNotificationEmailJob;
use App\Modules\Notifications\Models\EmailLog;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Users\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    /**
     * Format a numeric amount in Philippine Pesos (e.g. ₱4,500.10).
     */
    public static function formatPeso(float|int|string|null $amount): string
    {
        return '₱' . number_format((float) ($amount ?? 0), 2, '.', ',');
    }

    /**
     * Query all admin users (Accounting department or explicit admin/finance roles).
     */
    public static function getAdminUsers(?int $excludeUserId = null): Collection
    {
        $query = User::query()->where(function ($q) {
            $q->whereRaw('LOWER(TRIM(COALESCE(department, ""))) = ?', ['accounting'])
              ->orWhereIn('role', ['admin', 'superadmin', 'finance', 'accounting']);
        });

        if ($excludeUserId !== null) {
            $query->where('id', '!=', $excludeUserId);
        }

        return $query->get();
    }

    /**
     * Enrich metadata with extracted amount, status, and comment/reason so emails always show structured fields.
     */
    private static function enrichMetadata(string $type, string $title, string $message, array $metadata = []): array
    {
        if (empty($metadata['amount']) && preg_match('/₱[\d,]+(?:\.\d{2})?/', $message, $amtMatch)) {
            $metadata['amount'] = $amtMatch[0];
        } elseif (isset($metadata['amount']) && is_numeric($metadata['amount'])) {
            $metadata['amount'] = self::formatPeso($metadata['amount']);
        }

        if (empty($metadata['comment']) && preg_match('/(?:comment|note|reason):\s*"([^"]+)"/i', $message, $commentMatch)) {
            $metadata['comment'] = $commentMatch[1];
        }

        if (empty($metadata['status'])) {
            $metadata['status'] = match (true) {
                str_contains($type, 'approved') => 'Approved',
                str_contains($type, 'rejected') => 'Rejected',
                str_contains($type, 'revised') => 'Needs Revision',
                str_contains($type, 'cancelled') => 'Cancelled',
                str_contains($type, 'granted') => 'Granted',
                str_contains($type, 'disbursed') => 'Disbursed',
                str_contains($type, 'settled') => 'Settled',
                str_contains($type, 'submitted') => 'Pending / Submitted',
                str_contains($type, 'signed') || str_contains($type, 'acknowledged') => 'Acknowledged',
                str_contains($type, 'resubmitted') => 'Resubmitted',
                str_contains($type, 'overdue') => 'Overdue',
                str_contains($type, 'due_today') => 'Due Today',
                str_contains($type, 'due_soon') => 'Due Soon',
                default => null,
            };
        }

        if (!empty($metadata['penalty_amount']) && empty($metadata['penalty_formatted'])) {
            $metadata['penalty_formatted'] = self::formatPeso($metadata['penalty_amount']);
        }

        return array_filter($metadata, fn ($v) => $v !== null && $v !== '');
    }

    /**
     * Evaluate user email settings, record an EmailLog row, and dispatch SendNotificationEmailJob if allowed.
     */
    private static function dispatchEmailForNotification(Notification $notification): void
    {
        try {
            $recipient = User::find($notification->user_id);
            if (!$recipient || empty($recipient->email)) {
                return;
            }

            $eval = NotificationPreferenceService::shouldSendEmail($recipient, $notification->type);
            if ($eval['setting_key'] === null) {
                // In-app only notification type (e.g. My Expense draft receipt upload)
                return;
            }

            $subject = '[SERMS] ' . ($notification->title ?: $notification->module);

            if (!$eval['allowed']) {
                EmailLog::create([
                    'notification_id' => $notification->id,
                    'user_id' => $recipient->id,
                    'recipient_email' => $recipient->email,
                    'type' => $notification->type,
                    'setting_key' => $eval['setting_key'],
                    'module' => $notification->module,
                    'record_type' => $notification->record_type,
                    'record_id' => $notification->record_id,
                    'record_link' => $notification->record_link,
                    'subject' => $subject,
                    'status' => $eval['reason'] ?? 'skipped by user setting',
                    'attempts' => 0,
                ]);
                return;
            }

            $emailLog = EmailLog::create([
                'notification_id' => $notification->id,
                'user_id' => $recipient->id,
                'recipient_email' => $recipient->email,
                'type' => $notification->type,
                'setting_key' => $eval['setting_key'],
                'module' => $notification->module,
                'record_type' => $notification->record_type,
                'record_id' => $notification->record_id,
                'record_link' => $notification->record_link,
                'subject' => $subject,
                'status' => 'queued',
                'attempts' => 0,
            ]);

            SendNotificationEmailJob::dispatch($emailLog->id);
        } catch (\Throwable $e) {
            Log::error('NotificationService::dispatchEmailForNotification failed', [
                'notification_id' => $notification->id,
                'user_id' => $notification->user_id,
                'type' => $notification->type,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Create a single unread notification for a target user and queue its email if enabled.
     */
    public static function notifyUser(
        int $userId,
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        ?string $recordType = null,
        ?int $recordId = null,
        array $metadata = []
    ): Notification {
        try {
            $enriched = self::enrichMetadata($type, $title, $message, $metadata);

            $notification = Notification::create([
                'user_id' => $userId,
                'type' => $type,
                'module' => $module,
                'title' => $title,
                'message' => $message,
                'record_type' => $recordType,
                'record_id' => $recordId,
                'record_link' => $recordLink,
                'is_read' => false,
                'metadata' => !empty($enriched) ? $enriched : null,
            ]);

            self::dispatchEmailForNotification($notification);

            return $notification;
        } catch (\Throwable $e) {
            Log::error('NotificationService::notifyUser failed', [
                'user_id' => $userId,
                'type' => $type,
                'module' => $module,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Create a single unread notification only if an identical (user_id, type, record_type, record_id)
     * notification does not already exist. Used by daily deadline/overdue checks (G2-071, G2-077).
     */
    public static function notifyOnce(
        int $userId,
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        string $recordType,
        int $recordId,
        array $metadata = []
    ): ?Notification {
        $exists = Notification::query()
            ->where('user_id', $userId)
            ->where('type', $type)
            ->where('record_type', $recordType)
            ->where('record_id', $recordId)
            ->exists();

        if ($exists) {
            return null;
        }

        return self::notifyUser(
            userId: $userId,
            type: $type,
            module: $module,
            title: $title,
            message: $message,
            recordLink: $recordLink,
            recordType: $recordType,
            recordId: $recordId,
            metadata: $metadata
        );
    }

    /**
     * Notify all admin users.
     */
    public static function notifyAdmins(
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        ?string $recordType = null,
        ?int $recordId = null,
        array $metadata = [],
        ?int $excludeUserId = null
    ): Collection {
        $admins = self::getAdminUsers($excludeUserId);
        $created = collect();

        foreach ($admins as $admin) {
            $created->push(self::notifyUser(
                userId: (int) $admin->id,
                type: $type,
                module: $module,
                title: $title,
                message: $message,
                recordLink: $recordLink,
                recordType: $recordType,
                recordId: $recordId,
                metadata: $metadata
            ));
        }

        return $created;
    }

    /**
     * Notify all admin users once per (type, record_type, record_id).
     */
    public static function notifyAdminsOnce(
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        string $recordType,
        int $recordId,
        array $metadata = [],
        ?int $excludeUserId = null
    ): Collection {
        $admins = self::getAdminUsers($excludeUserId);
        $created = collect();

        foreach ($admins as $admin) {
            $notif = self::notifyOnce(
                userId: (int) $admin->id,
                type: $type,
                module: $module,
                title: $title,
                message: $message,
                recordLink: $recordLink,
                recordType: $recordType,
                recordId: $recordId,
                metadata: $metadata
            );
            if ($notif) {
                $created->push($notif);
            }
        }

        return $created;
    }
}
